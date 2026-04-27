from dataclasses import dataclass
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import array
from sqlalchemy import func
from app.models.model_registry import ModelRegistry
from app.core.exceptions import ModelNotFoundError
from app.routing.scorer import score_model
from app.routing.config import RoutingConfig


@dataclass
class SelectedModel:
    provider: str
    model_id: str
    cost_per_unit: float
    unit_type: str
    requires_user_key: bool = False


class RoutingEngine:
    def __init__(self, db: Session):
        self.db = db

    def select(self, modality: str, mode: str, model_id: str | None, provider: str | None, task_type: str | None = None, max_cost: float | None = None, available_providers: list[str] | None = None) -> SelectedModel:
        if mode == "manual":
            return self._manual(modality, model_id, provider)
        if mode == "auto":
            return self._auto(modality, task_type, available_providers)
        if mode == "best":
            return self._best(modality, task_type, available_providers)
        if mode == "budget":
            return self._budget(modality, task_type, max_cost, available_providers)
        raise HTTPException(
            status_code=400,
            detail={"code": "UNSUPPORTED_MODE", "message": "mode must be 'manual', 'auto', 'best', or 'budget'."},
        )

    def _manual(self, modality: str, model_id: str | None, provider: str | None) -> SelectedModel:
        if not model_id:
            raise HTTPException(
                status_code=400,
                detail={"code": "MISSING_MODEL", "message": "mode=manual requires a 'model' field."},
            )

        query = self.db.query(ModelRegistry).filter(
            ModelRegistry.model_id == model_id,
            ModelRegistry.modality == modality,
            ModelRegistry.is_active == True,
        )
        if provider:
            query = query.filter(ModelRegistry.provider == provider)

        model = query.first()
        if not model:
            raise ModelNotFoundError(model_id)

        return SelectedModel(
            provider=model.provider,
            model_id=model.model_id,
            cost_per_unit=float(model.cost_per_unit),
            unit_type=model.unit_type,
            requires_user_key=bool(model.requires_user_key),
        )

    @staticmethod
    def _filter_by_task_type(candidates: list, task_type: str) -> list:
        filtered = [m for m in candidates if m.task_types and task_type in m.task_types]
        if filtered:
            return filtered
        by_task = [m for m in candidates if m.task_type == task_type]
        return by_task if by_task else candidates

    def _auto(self, modality: str, task_type: str | None = None, available_providers: list[str] | None = None) -> SelectedModel:
        query = self.db.query(ModelRegistry).filter(
            ModelRegistry.modality == modality,
            ModelRegistry.is_active == True,
            ModelRegistry.requires_user_key == False,
        )
        candidates = query.all()

        if available_providers is not None:
            # Only pick models we have API keys for.
            # Handle providers that route through fal (see GenerationService._FAL_BACKED)
            _FAL_BACKED = {"kling", "luma", "hailuo", "wan", "bytedance", "runway", "topaz", "blackforestlabs"}
            candidates = [
                m for m in candidates 
                if m.provider in available_providers or (m.provider in _FAL_BACKED and "fal" in available_providers)
            ]

        if task_type:
            candidates = self._filter_by_task_type(candidates, task_type)

        if RoutingConfig.BLACKLISTED_PROVIDERS:
            candidates = [m for m in candidates if m.provider not in RoutingConfig.BLACKLISTED_PROVIDERS]

        if RoutingConfig.PREFERRED_PROVIDER.get(modality):
            preferred = [m for m in candidates if m.provider == RoutingConfig.PREFERRED_PROVIDER[modality]]
            if preferred:
                candidates = preferred

        if not candidates:
            raise HTTPException(
                status_code=404,
                detail={"code": "NO_MODELS_AVAILABLE", "message": f"No active system-key models with configured API keys for modality '{modality}'."},
            )

        max_cost    = max(float(m.cost_per_unit) for m in candidates)
        max_latency = max(m.avg_latency_ms or 9999 for m in candidates)
        best = max(candidates, key=lambda m: score_model(m, max_cost, max_latency))

        return SelectedModel(
            provider=best.provider,
            model_id=best.model_id,
            cost_per_unit=float(best.cost_per_unit),
            unit_type=best.unit_type,
        )

    def _best(self, modality: str, task_type: str | None = None, available_providers: list[str] | None = None) -> SelectedModel:
        query = self.db.query(ModelRegistry).filter(
            ModelRegistry.modality == modality,
            ModelRegistry.is_active == True,
            ModelRegistry.requires_user_key == False,
        )
        candidates = query.all()

        if available_providers is not None:
            _FAL_BACKED = {"kling", "luma", "hailuo", "wan", "bytedance", "runway", "topaz", "blackforestlabs"}
            candidates = [
                m for m in candidates 
                if m.provider in available_providers or (m.provider in _FAL_BACKED and "fal" in available_providers)
            ]

        if task_type:
            candidates = self._filter_by_task_type(candidates, task_type)

        if not candidates:
            raise HTTPException(status_code=404, detail={"code": "NO_MODELS_AVAILABLE", "message": f"No active system-key models with configured API keys for modality '{modality}'."})

        best = max(candidates, key=lambda m: float(m.quality_score or 0))
        return SelectedModel(provider=best.provider, model_id=best.model_id, cost_per_unit=float(best.cost_per_unit), unit_type=best.unit_type, requires_user_key=bool(best.requires_user_key))

    def _budget(self, modality: str, task_type: str | None = None, max_cost: float | None = None, available_providers: list[str] | None = None) -> SelectedModel:
        query = self.db.query(ModelRegistry).filter(
            ModelRegistry.modality == modality,
            ModelRegistry.is_active == True,
            ModelRegistry.requires_user_key == False,
        )
        candidates = query.all()

        if available_providers is not None:
            _FAL_BACKED = {"kling", "luma", "hailuo", "wan", "bytedance", "runway", "topaz", "blackforestlabs"}
            candidates = [
                m for m in candidates 
                if m.provider in available_providers or (m.provider in _FAL_BACKED and "fal" in available_providers)
            ]

        if task_type:
            candidates = self._filter_by_task_type(candidates, task_type)

        if max_cost is not None:
            under_budget = [m for m in candidates if float(m.cost_per_unit) <= max_cost]
            if under_budget:
                candidates = under_budget

        if not candidates:
            raise HTTPException(status_code=404, detail={"code": "NO_MODELS_IN_BUDGET", "message": f"No active models under cost ceiling {max_cost} with configured API keys."})

        best = max(candidates, key=lambda m: float(m.quality_score or 0))
        return SelectedModel(provider=best.provider, model_id=best.model_id, cost_per_unit=float(best.cost_per_unit), unit_type=best.unit_type, requires_user_key=bool(best.requires_user_key))

    def find_fallback(self, modality: str, task_type: str | None, exclude_provider: str, available_providers: list[str] | None = None) -> SelectedModel | None:
        """Return the best available model for modality, excluding the given provider."""
        query = self.db.query(ModelRegistry).filter(
            ModelRegistry.modality == modality,
            ModelRegistry.is_active == True,
            ModelRegistry.requires_user_key == False,
            ModelRegistry.provider != exclude_provider,
        )
        candidates = query.all()

        if available_providers is not None:
            _FAL_BACKED = {"kling", "luma", "hailuo", "wan", "bytedance", "runway", "topaz", "blackforestlabs"}
            candidates = [
                m for m in candidates 
                if m.provider in available_providers or (m.provider in _FAL_BACKED and "fal" in available_providers)
            ]

        if task_type:
            candidates = self._filter_by_task_type(candidates, task_type)

        if not candidates:
            return None

        max_cost    = max(float(m.cost_per_unit) for m in candidates)
        max_latency = max(m.avg_latency_ms or 9999 for m in candidates)
        best = max(candidates, key=lambda m: score_model(m, max_cost, max_latency))
        return SelectedModel(
            provider=best.provider,
            model_id=best.model_id,
            cost_per_unit=float(best.cost_per_unit),
            unit_type=best.unit_type,
        )

    def select_with_fallback(self, modality: str, model_id: str, fallback_providers: list[str] | None = None) -> SelectedModel:
        try:
            return self._manual(modality, model_id, None)
        except Exception:
            if not fallback_providers:
                raise
            fallbacks = self.db.query(ModelRegistry).filter(
                ModelRegistry.provider.in_(fallback_providers),
                ModelRegistry.modality == modality,
                ModelRegistry.is_active == True,
            ).all()
            ordered = sorted(fallbacks, key=lambda m: fallback_providers.index(m.provider))
            if ordered:
                m = ordered[0]
                return SelectedModel(provider=m.provider, model_id=m.model_id, cost_per_unit=float(m.cost_per_unit), unit_type=m.unit_type)
            raise
