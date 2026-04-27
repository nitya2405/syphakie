import time
import uuid
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.request_record import RequestRecord
from app.schemas.generate import GenerateRequest, GenerateResponse, OutputSchema, MetaSchema
from app.routing.engine import RoutingEngine, SelectedModel
from app.providers import get_adapter
from app.providers.base import AdapterRequest
from app.services.outputs import OutputService
from app.services.credits import CreditService
from app.services.usage import UsageService
from app.api.cache import get_cached, store_cache
from app.config import settings

# Providers that route through fal.ai infrastructure
_FAL_BACKED = {"kling", "luma", "hailuo", "wan", "bytedance", "runway", "topaz", "blackforestlabs"}

_PLATFORM_KEYS: dict[str, str] = {
    "openai":      settings.OPENAI_API_KEY,
    "anthropic":   settings.ANTHROPIC_API_KEY,
    "google":      settings.GOOGLE_API_KEY,
    "stability":   settings.STABILITY_API_KEY,
    "xai":         settings.XAI_API_KEY,
    "elevenlabs":  settings.ELEVENLABS_API_KEY,
    "qwen":        settings.QWEN_API_KEY,
    "fal":         settings.FAL_API_KEY,
}


class GenerationService:
    def __init__(self, db: Session):
        self.db = db
        self.router = RoutingEngine(db)
        self.output_svc = OutputService()
        self.credit_svc = CreditService(db)
        self.usage_svc = UsageService(db)

    def _find_fallback(self, failed: SelectedModel, modality: str, task_type: str | None) -> SelectedModel | None:
        configured = [p for p, k in _PLATFORM_KEYS.items() if k]
        candidate = self.router.find_fallback(modality, task_type, failed.provider, available_providers=configured)
        return candidate

    def _resolve_key(self, selected: SelectedModel) -> str:
        key_provider = "fal" if selected.provider in _FAL_BACKED else selected.provider
        key = _PLATFORM_KEYS.get(key_provider, "")
        if not key:
            raise HTTPException(
                status_code=503,
                detail={"code": "PROVIDER_NOT_CONFIGURED",
                        "message": f"Provider '{key_provider}' is not available on this platform."},
            )
        return key

    async def run(self, user: User, request: GenerateRequest) -> GenerateResponse:
        request_id = str(uuid.uuid4())
        output_url = None

        use_org = request.use_org_credits and user.org_id is not None
        org_id = user.org_id if use_org else None

        record = RequestRecord(
            id=request_id,
            user_id=user.id,
            modality=request.modality,
            routing_mode=request.mode,
            status="pending",
            input_payload={"prompt": request.prompt, "params": request.params},
        )
        self.db.add(record)
        self.db.commit()

        # Notify Telegram that generation has started
        try:
            from app.telegram.notifier import dispatch_telegram
            await dispatch_telegram(self.db, str(user.id), "generation.started", {
                "modality": request.modality,
                "model": request.model or "auto",
            })
        except Exception:
            pass

        try:
            if request.use_cache and request.model:
                cached = get_cached(self.db, request.modality, request.model, request.prompt)
                if cached:
                    remaining = (
                        self.credit_svc.get_org_balance(org_id)
                        if use_org
                        else self.credit_svc.get_balance(user.id)
                    )
                    record.status = "success"
                    record.output_url = cached.output_url
                    record.credits_deducted = 0
                    record.latency_ms = 0
                    record.completed_at = datetime.now(timezone.utc)
                    self.db.commit()
                    return GenerateResponse(
                        success=True,
                        request_id=request_id,
                        modality=request.modality,
                        provider="cache",
                        model=cached.model_id,
                        output=OutputSchema(type=cached.output_type or request.modality, content=cached.output_content, url=cached.output_url, mime_type=None),
                        meta=MetaSchema(latency_ms=0, credits_used=0, credits_remaining=remaining, units_used=0, unit_type="cache", routing_mode="cache"),
                    )

            configured = [p for p, k in _PLATFORM_KEYS.items() if k]
            selected = self.router.select(
                modality=request.modality,
                mode=request.mode,
                model_id=request.model,
                provider=request.provider,
                task_type=request.task_type,
                max_cost=request.max_cost,
                available_providers=configured,
            )
            record.provider = selected.provider
            record.model_id = selected.model_id
            self.db.commit()

            estimated = self.credit_svc.estimate(selected, request.params)
            if use_org:
                self.credit_svc.prededuct_org(org_id, estimated)
            else:
                self.credit_svc.prededuct(user.id, estimated)

            api_key = self._resolve_key(selected)
            adapter = get_adapter(selected.provider)
            adapter_req = AdapterRequest(
                modality=request.modality,
                prompt=request.prompt,
                image_url=request.image_url,
                file_url=request.file_url,
                model_id=selected.model_id,
                params=request.params,
                api_key=api_key,
            )

            start = time.monotonic()
            fallback_provider: str | None = None
            try:
                adapter_resp = await adapter.generate(adapter_req)
            except Exception as primary_err:
                fallback = (
                    self._find_fallback(selected, request.modality, request.task_type)
                    if request.mode in ("auto", "best")
                    else None
                )

                if fallback is None:
                    if use_org:
                        self.credit_svc.refund_org(org_id, estimated)
                    else:
                        self.credit_svc.refund(user.id, estimated)
                    raise primary_err

                # Refund primary estimate, re-estimate + pre-deduct for fallback
                if use_org:
                    self.credit_svc.refund_org(org_id, estimated)
                else:
                    self.credit_svc.refund(user.id, estimated)

                estimated = self.credit_svc.estimate(fallback, request.params)
                if use_org:
                    self.credit_svc.prededuct_org(org_id, estimated)
                else:
                    self.credit_svc.prededuct(user.id, estimated)

                fallback_req = AdapterRequest(
                    modality=request.modality,
                    prompt=request.prompt,
                    image_url=request.image_url,
                    file_url=request.file_url,
                    model_id=fallback.model_id,
                    params=request.params,
                    api_key=self._resolve_key(fallback),
                )
                try:
                    adapter_resp = await get_adapter(fallback.provider).generate(fallback_req)
                except Exception:
                    if use_org:
                        self.credit_svc.refund_org(org_id, estimated)
                    else:
                        self.credit_svc.refund(user.id, estimated)
                    raise primary_err  # surface the original error, not the fallback error

                fallback_provider = fallback.provider
                selected = fallback
                record.provider = fallback.provider
                record.model_id = fallback.model_id
                self.db.commit()

            latency_ms = int((time.monotonic() - start) * 1000)

            if use_org:
                actual = self.credit_svc.adjust_to_actual_org(
                    org_id=org_id,
                    estimated=estimated,
                    units_used=adapter_resp.units_used,
                    cost_per_unit=selected.cost_per_unit,
                )
                remaining = self.credit_svc.get_org_balance(org_id)
            else:
                actual = self.credit_svc.adjust_to_actual(
                    user_id=user.id,
                    estimated=estimated,
                    units_used=adapter_resp.units_used,
                    cost_per_unit=selected.cost_per_unit,
                )
                remaining = self.credit_svc.get_balance(user.id)

            output_url = self.output_svc.save(
                user_id=str(user.id),
                request_id=request_id,
                modality=request.modality,
                content=adapter_resp.content,
                file_bytes=adapter_resp.file_bytes,
                file_extension=adapter_resp.file_extension,
            )

            record.status = "success"
            record.output_url = output_url
            record.credits_deducted = actual
            record.latency_ms = latency_ms
            record.completed_at = datetime.now(timezone.utc)
            self.db.commit()

            if request.use_cache and request.modality == "text":
                try:
                    store_cache(self.db, request.modality, selected.model_id, request.prompt, adapter_resp.content, output_url, request.modality, float(actual))
                except Exception:
                    pass

            self.usage_svc.log(
                request_id=request_id,
                user_id=user.id,
                provider=selected.provider,
                model_id=selected.model_id,
                units_used=adapter_resp.units_used,
                unit_type=adapter_resp.unit_type,
                cost_per_unit=selected.cost_per_unit,
                credits_charged=actual,
                estimated_credits=estimated,
            )

            # Dispatch webhook
            try:
                from app.api.webhooks import dispatch_webhook
                await dispatch_webhook(self.db, str(user.id), "generation.complete", {
                    "request_id": request_id,
                    "modality": request.modality,
                    "provider": selected.provider,
                    "model": selected.model_id,
                    "credits_used": actual,
                })
            except Exception:
                pass

            # Notify Telegram (enriched payload includes output and remaining balance)
            try:
                from app.telegram.notifier import dispatch_telegram
                await dispatch_telegram(self.db, str(user.id), "generation.complete", {
                    "request_id": request_id,
                    "modality": request.modality,
                    "provider": selected.provider,
                    "model": selected.model_id,
                    "prompt": request.prompt[:80],
                    "credits_used": actual,
                    "credits_remaining": remaining,
                    "output_url": output_url,
                    "output_content": adapter_resp.content[:500] if adapter_resp.content else None,
                })
            except Exception:
                pass

        except Exception as e:
            record.status = "failed"
            record.error_message = str(e)
            record.completed_at = datetime.now(timezone.utc)
            self.db.commit()

            try:
                from app.api.webhooks import dispatch_webhook
                await dispatch_webhook(self.db, str(user.id), "generation.failed", {
                    "request_id": request_id,
                    "error": str(e),
                })
            except Exception:
                pass

            try:
                from app.telegram.notifier import dispatch_telegram
                await dispatch_telegram(self.db, str(user.id), "generation.failed", {
                    "request_id": request_id,
                    "error": str(e),
                })
            except Exception:
                pass

            raise

        _mime_prefix = {"image": "image", "video": "video", "audio": "audio"}
        mime_type = (
            f"{_mime_prefix[request.modality]}/{adapter_resp.file_extension}"
            if request.modality in _mime_prefix and adapter_resp.file_extension
            else None
        )

        # Force modality to text for speech-to-text regardless of requested modality
        res_modality = "text" if request.task_type == "speech_to_text" else request.modality

        return GenerateResponse(
            success=True,
            request_id=request_id,
            modality=res_modality,
            provider=selected.provider,
            model=selected.model_id,
            output=OutputSchema(
                type=res_modality,
                content=adapter_resp.content,
                url=output_url,
                mime_type=None,
            ),

            meta=MetaSchema(
                latency_ms=latency_ms,
                credits_used=actual,
                credits_remaining=remaining,
                units_used=adapter_resp.units_used,
                unit_type=adapter_resp.unit_type,
                routing_mode=request.mode,
                fallback_provider=fallback_provider,
            ),
        )
