from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.api.deps import require_admin, get_db
from app.models.model_registry import ModelRegistry
from app.models.user import User

router = APIRouter()


@router.get("/admin/models")
def list_all_models(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    models = db.query(ModelRegistry).order_by(ModelRegistry.modality, ModelRegistry.provider).all()
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


class ModelUpdateRequest(BaseModel):
    quality_score: float | None = None     # 0.0–1.0
    avg_latency_ms: int | None = None
    is_active: bool | None = None
    cost_per_unit: float | None = None


@router.patch("/admin/models/{model_id}")
def update_model(
    model_id: str,
    body: ModelUpdateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    model = db.query(ModelRegistry).filter_by(model_id=model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail={"code": "MODEL_NOT_FOUND", "message": f"Model '{model_id}' not found."})

    if body.quality_score is not None:
        if not 0.0 <= body.quality_score <= 1.0:
            raise HTTPException(status_code=400, detail={"code": "INVALID_VALUE", "message": "quality_score must be between 0.0 and 1.0."})
        model.quality_score = body.quality_score

    if body.avg_latency_ms is not None:
        model.avg_latency_ms = body.avg_latency_ms

    if body.is_active is not None:
        model.is_active = body.is_active

    if body.cost_per_unit is not None:
        model.cost_per_unit = body.cost_per_unit

    db.commit()

    return {
        "model_id": model.model_id,
        "provider": model.provider,
        "quality_score": float(model.quality_score) if model.quality_score else None,
        "avg_latency_ms": model.avg_latency_ms,
        "is_active": model.is_active,
        "cost_per_unit": float(model.cost_per_unit),
    }
