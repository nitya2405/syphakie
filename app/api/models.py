from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.models.model_registry import ModelRegistry
from app.models.user import User

router = APIRouter()


def _serialize(m: ModelRegistry, full: bool = False) -> dict:
    d = {
        "model_id": m.model_id,
        "provider": m.provider,
        "modality": m.modality,
        "task_type": m.task_type,
        "vendor": m.vendor,
        "display_name": m.display_name,
        "cost_per_unit": float(m.cost_per_unit),
        "unit_type": m.unit_type,
        "avg_latency_ms": m.avg_latency_ms,
        "quality_score": float(m.quality_score) if m.quality_score else None,
        "requires_user_key": m.requires_user_key,
    }
    if full:
        d["is_active"] = m.is_active
    return d


@router.get("/models")
def list_all_models(
    modality: str | None = None,
    task_type: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All models (active and inactive) for the model explorer."""
    query = db.query(ModelRegistry)
    if modality:
        query = query.filter(ModelRegistry.modality == modality)
    if task_type:
        query = query.filter(ModelRegistry.task_type == task_type)

    models = query.order_by(ModelRegistry.modality, ModelRegistry.provider).all()
    return {"models": [_serialize(m, full=True) for m in models]}


@router.get("/models/list")
def list_active_models(
    modality: str | None = None,
    provider: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Active models for the generate dropdown."""
    query = db.query(ModelRegistry).filter(ModelRegistry.is_active == True)
    if modality:
        query = query.filter(ModelRegistry.modality == modality)
    if provider:
        query = query.filter(ModelRegistry.provider == provider)

    models = query.all()
    return {"models": [_serialize(m) for m in models]}
