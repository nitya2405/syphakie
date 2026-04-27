"""Model leaderboard — ratings, benchmarks, and public quality scores."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from pydantic import BaseModel
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.model_rating import ModelRating
from app.models.model_registry import ModelRegistry
from app.models.request_record import RequestRecord

router = APIRouter()


class RatingCreate(BaseModel):
    request_id: str
    rating: int   # 1 or 5
    comment: str | None = None


@router.post("/leaderboard/rate")
def rate_model(
    body: RatingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.rating not in (1, 5):
        raise HTTPException(status_code=400, detail={"code": "INVALID_RATING", "message": "Rating must be 1 (bad) or 5 (good)."})

    record = db.query(RequestRecord).filter_by(id=body.request_id, user_id=current_user.id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Request not found")

    existing = db.query(ModelRating).filter_by(request_id=body.request_id).first()
    if existing:
        existing.rating = body.rating
        existing.comment = body.comment
        db.commit()
        return {"ok": True, "updated": True}

    mr = ModelRating(
        user_id=current_user.id,
        request_id=body.request_id,
        model_id=record.model_id or "",
        provider=record.provider or "",
        modality=record.modality,
        rating=body.rating,
        comment=body.comment,
    )
    db.add(mr)

    # Update quality_score on model registry (rolling avg)
    model_rec = db.query(ModelRegistry).filter_by(model_id=record.model_id).first()
    if model_rec:
        avg = db.query(func.avg(ModelRating.rating)).filter_by(model_id=record.model_id).scalar() or 0
        model_rec.quality_score = round(float(avg) / 5.0, 2)

    db.commit()
    return {"ok": True, "updated": False}


@router.get("/leaderboard")
def get_leaderboard(
    modality: str | None = None,
    db: Session = Depends(get_db),
):
    """Public leaderboard ranked by community rating + latency."""
    query = db.query(
        ModelRegistry.model_id,
        ModelRegistry.display_name,
        ModelRegistry.provider,
        ModelRegistry.modality,
        ModelRegistry.cost_per_unit,
        ModelRegistry.unit_type,
        ModelRegistry.avg_latency_ms,
        ModelRegistry.quality_score,
        func.count(ModelRating.id).label("rating_count"),
        func.avg(ModelRating.rating).label("avg_rating"),
        func.sum(case((ModelRating.rating == 5, 1), else_=0)).label("thumbs_up"),
        func.sum(case((ModelRating.rating == 1, 1), else_=0)).label("thumbs_down"),
    ).outerjoin(
        ModelRating, ModelRegistry.model_id == ModelRating.model_id
    ).filter(ModelRegistry.is_active == True)

    if modality:
        query = query.filter(ModelRegistry.modality == modality)

    # Calculate a sorting score: community avg if available, else benchmark score (quality_score * 5)
    sort_score = func.coalesce(func.avg(ModelRating.rating), ModelRegistry.quality_score * 5)

    rows = query.group_by(
        ModelRegistry.model_id, ModelRegistry.display_name, ModelRegistry.provider,
        ModelRegistry.modality, ModelRegistry.cost_per_unit, ModelRegistry.unit_type,
        ModelRegistry.avg_latency_ms, ModelRegistry.quality_score,
    ).order_by(sort_score.desc().nullslast()).all()

    return {
        "leaderboard": [
            {
                "model_id": r.model_id,
                "display_name": r.display_name,
                "provider": r.provider,
                "modality": r.modality,
                "cost_per_unit": float(r.cost_per_unit),
                "unit_type": r.unit_type,
                "avg_latency_ms": r.avg_latency_ms,
                "quality_score": float(r.quality_score) if r.quality_score else None,
                "rating_count": r.rating_count,
                "avg_rating": round(float(r.avg_rating), 2) if r.avg_rating else None,
                "thumbs_up": r.thumbs_up or 0,
                "thumbs_down": r.thumbs_down or 0,
            }
            for r in rows
        ]
    }


@router.get("/leaderboard/providers")
def provider_status(db: Session = Depends(get_db)):
    """Live provider uptime derived from recent request telemetry (last 24h)."""
    from sqlalchemy import text
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    rows = (
        db.query(
            RequestRecord.provider,
            func.count(RequestRecord.id).label("total"),
            func.sum(case((RequestRecord.status == "success", 1), else_=0)).label("success"),
            func.avg(RequestRecord.latency_ms).label("avg_latency"),
        )
        .filter(RequestRecord.created_at >= cutoff, RequestRecord.provider != None)
        .group_by(RequestRecord.provider)
        .all()
    )
    return {
        "providers": [
            {
                "provider": r.provider,
                "total_requests": r.total,
                "success_count": r.success or 0,
                "error_rate": round(1 - (r.success or 0) / max(r.total, 1), 3),
                "avg_latency_ms": int(r.avg_latency) if r.avg_latency else None,
                "uptime_pct": round((r.success or 0) / max(r.total, 1) * 100, 1),
            }
            for r in rows
        ]
    }
