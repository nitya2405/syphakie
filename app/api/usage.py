from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime
from app.api.deps import get_current_user, get_db
from app.models.request_record import RequestRecord
from app.models.user import User

router = APIRouter()


@router.get("/usage")
def get_usage(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    modality: str | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(RequestRecord).filter(RequestRecord.user_id == current_user.id)

    if modality:
        query = query.filter(RequestRecord.modality == modality)
    if from_date:
        query = query.filter(RequestRecord.created_at >= from_date)
    if to_date:
        query = query.filter(RequestRecord.created_at <= to_date)

    total = query.count()
    records = query.order_by(desc(RequestRecord.created_at)).offset(offset).limit(limit).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "request_id": str(r.id),
                "modality": r.modality,
                "provider": r.provider,
                "model": r.model_id,
                "status": r.status,
                "credits_deducted": r.credits_deducted,
                "latency_ms": r.latency_ms,
                "error_message": r.error_message,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ],
    }
