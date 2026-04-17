import time
import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.request_record import RequestRecord
from app.schemas.generate import GenerateRequest, GenerateResponse, OutputSchema, MetaSchema
from app.routing.engine import RoutingEngine
from app.providers import get_adapter
from app.providers.base import AdapterRequest
from app.services.outputs import OutputService
from app.services.credits import CreditService
from app.services.usage import UsageService
from app.services.provider_keys import ProviderKeyService
from app.config import settings

SYSTEM_KEY_PROVIDERS = {"openai", "stability"}


class GenerationService:
    def __init__(self, db: Session):
        self.db = db
        self.router = RoutingEngine(db)
        self.output_svc = OutputService()
        self.credit_svc = CreditService(db)
        self.usage_svc = UsageService(db)
        self.provider_key_svc = ProviderKeyService(db)

    def _resolve_key(self, provider: str, user) -> str:
        if provider in SYSTEM_KEY_PROVIDERS:
            key_map = {"openai": settings.OPENAI_API_KEY, "stability": settings.STABILITY_API_KEY}
            return key_map[provider]
        return self.provider_key_svc.get_key(user.id, provider)

    async def run(self, user: User, request: GenerateRequest) -> GenerateResponse:
        request_id = str(uuid.uuid4())

        # 1. Write pending record immediately
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

        try:
            # 2. Route
            selected = self.router.select(
                modality=request.modality,
                mode=request.mode,
                model_id=request.model,
                provider=request.provider,
            )
            record.provider = selected.provider
            record.model_id = selected.model_id
            self.db.commit()

            # 3. Estimate + pre-deduct credits
            estimated = self.credit_svc.estimate(request.modality, selected, request.params)
            self.credit_svc.prededuct(user.id, estimated)

            # 4. Resolve API key + call adapter
            api_key = self._resolve_key(selected.provider, user)
            adapter = get_adapter(selected.provider)
            adapter_req = AdapterRequest(
                modality=request.modality,
                prompt=request.prompt,
                model_id=selected.model_id,
                params=request.params,
                api_key=api_key,
            )

            start = time.monotonic()
            try:
                adapter_resp = await adapter.generate(adapter_req)
            except Exception as e:
                self.credit_svc.refund(user.id, estimated)
                raise e
            latency_ms = int((time.monotonic() - start) * 1000)

            # 5. Adjust credits to actual
            actual = self.credit_svc.adjust_to_actual(
                user_id=user.id,
                estimated=estimated,
                units_used=adapter_resp.units_used,
                cost_per_unit=selected.cost_per_unit,
            )
            remaining = self.credit_svc.get_balance(user.id)

            # 6. Save output
            output_url = self.output_svc.save(
                user_id=str(user.id),
                request_id=request_id,
                modality=request.modality,
                content=adapter_resp.content,
                file_bytes=adapter_resp.file_bytes,
                file_extension=adapter_resp.file_extension,
            )

            # 7. Mark record success
            record.status = "success"
            record.output_url = output_url
            record.credits_deducted = actual
            record.latency_ms = latency_ms
            record.completed_at = datetime.now(timezone.utc)
            self.db.commit()

            # 8. Write usage log
            self.usage_svc.log(
                request_id=request_id,
                user_id=user.id,
                provider=selected.provider,
                model_id=selected.model_id,
                units_used=adapter_resp.units_used,
                unit_type=adapter_resp.unit_type,
                cost_per_unit=selected.cost_per_unit,
                credits_charged=actual,
            )

        except Exception as e:
            record.status = "failed"
            record.error_message = str(e)
            record.completed_at = datetime.now(timezone.utc)
            self.db.commit()
            raise

        return GenerateResponse(
            success=True,
            request_id=request_id,
            modality=request.modality,
            provider=selected.provider,
            model=selected.model_id,
            output=OutputSchema(
                type=request.modality,
                content=adapter_resp.content,
                url=output_url,
                mime_type=f"image/{adapter_resp.file_extension}" if request.modality == "image" else None,
            ),
            meta=MetaSchema(
                latency_ms=latency_ms,
                credits_used=actual,
                credits_remaining=remaining,
                units_used=adapter_resp.units_used,
                unit_type=adapter_resp.unit_type,
                routing_mode=request.mode,
            ),
        )
