from dataclasses import dataclass
from fastapi import HTTPException
from sqlalchemy.orm import Session
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


class RoutingEngine:
    def __init__(self, db: Session):
        self.db = db

    def select(self, modality: str, mode: str, model_id: str | None, provider: str | None) -> SelectedModel:
        if mode == "manual":
            return self._manual(modality, model_id, provider)
        if mode == "auto":
            return self._auto(modality)
        raise HTTPException(
            status_code=400,
            detail={"code": "UNSUPPORTED_MODE", "message": "mode must be 'manual' or 'auto'."},
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
        )

    def _auto(self, modality: str) -> SelectedModel:
        candidates = self.db.query(ModelRegistry).filter(
            ModelRegistry.modality == modality,
            ModelRegistry.is_active == True,
            ModelRegistry.requires_user_key == False,  # only system-key models in auto
        ).all()

        if RoutingConfig.BLACKLISTED_PROVIDERS:
            candidates = [m for m in candidates if m.provider not in RoutingConfig.BLACKLISTED_PROVIDERS]

        if RoutingConfig.PREFERRED_PROVIDER.get(modality):
            preferred = [m for m in candidates if m.provider == RoutingConfig.PREFERRED_PROVIDER[modality]]
            if preferred:
                candidates = preferred

        if not candidates:
            raise HTTPException(
                status_code=404,
                detail={"code": "NO_MODELS_AVAILABLE", "message": f"No active system-key models for modality '{modality}'."},
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
