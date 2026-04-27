from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import distinct
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from app.api.deps import require_admin, get_db
from app.models.model_registry import ModelRegistry
from app.models.notification import Notification
from app.models.request_record import RequestRecord
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


class DeprecateRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    successor_model_id: str | None = None
    message: str | None = None


@router.post("/admin/models/{model_id}/deprecate")
def deprecate_model(
    model_id: str,
    body: DeprecateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    model = db.query(ModelRegistry).filter_by(model_id=model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    model.is_active = False
    db.commit()

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    affected_users = (
        db.query(distinct(RequestRecord.user_id))
        .filter(RequestRecord.model_id == model_id, RequestRecord.created_at >= cutoff)
        .all()
    )

    successor_text = f" We recommend switching to {body.successor_model_id}." if body.successor_model_id else ""
    note_body = body.message or f"{model.display_name} has been deprecated.{successor_text}"

    for (uid,) in affected_users:
        notif = Notification(
            user_id=uid,
            type="model_deprecated",
            title=f"Model deprecated: {model.display_name}",
            body=note_body,
            link="/models",
        )
        db.add(notif)
    db.commit()

    return {"ok": True, "users_notified": len(affected_users), "successor": body.successor_model_id}


class ResellerConfig(BaseModel):
    user_id: str
    credit_markup_pct: float = 0.0   # markup percent on top of base price
    monthly_quota: int | None = None


@router.post("/admin/resellers")
def configure_reseller(
    body: ResellerConfig,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter_by(id=body.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = "reseller"
    db.commit()
    return {"ok": True, "user_id": body.user_id, "role": "reseller"}


@router.get("/admin/users")
def list_users(
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = db.query(User).order_by(User.created_at.desc()).limit(limit).all()
    return {
        "users": [
            {
                "id": str(u.id),
                "email": u.email,
                "name": u.name,
                "role": u.role,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ]
    }
