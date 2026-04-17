from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.models.model_registry import ModelRegistry
from app.models.user import User

router = APIRouter()


@router.get("/models")
def list_all_models_public(
    modality: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All models (active and inactive) for the model explorer."""
    query = db.query(ModelRegistry)
    if modality:
        query = query.filter(ModelRegistry.modality == modality)

    models = query.order_by(ModelRegistry.modality, ModelRegistry.provider).all()
    return {
        "models": [
            {
                "model_id": m.model_id,
                "provider": m.provider,
                "modality": m.modality,
                "display_name": m.display_name,
                "cost_per_unit": float(m.cost_per_unit),
                "unit_type": m.unit_type,
                "avg_latency_ms": m.avg_latency_ms,
                "quality_score": float(m.quality_score) if m.quality_score else None,
                "is_active": m.is_active,
                "requires_user_key": m.requires_user_key,
            }
            for m in models
        ]
    }


@router.get("/models/list")
def list_models(
    modality: str | None = None,
    provider: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(ModelRegistry).filter(ModelRegistry.is_active == True)
    if modality:
        query = query.filter(ModelRegistry.modality == modality)
    if provider:
        query = query.filter(ModelRegistry.provider == provider)

    models = query.all()
    return {
        "models": [
            {
                "model_id": m.model_id,
                "provider": m.provider,
                "modality": m.modality,
                "display_name": m.display_name,
                "cost_per_unit": float(m.cost_per_unit),
                "unit_type": m.unit_type,
                "avg_latency_ms": m.avg_latency_ms,
                "quality_score": float(m.quality_score) if m.quality_score else None,
                "requires_user_key": m.requires_user_key,
            }
            for m in models
        ]
    }
