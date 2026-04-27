from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from datetime import datetime, timedelta
from app.api.deps import get_current_user, get_db
from app.models.request_record import RequestRecord
from app.models.user import User

router = APIRouter()


@router.get("/usage/summary")
def get_usage_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    base = db.query(RequestRecord).filter(
        RequestRecord.user_id == current_user.id,
        RequestRecord.status == "success",
    )

    total = base.count()
    credits_used = base.with_entities(
        func.coalesce(func.sum(RequestRecord.credits_deducted), 0)
    ).scalar()

    by_modality = {
        row[0]: row[1]
        for row in base.with_entities(
            RequestRecord.modality, func.count(RequestRecord.id)
        ).group_by(RequestRecord.modality).all()
    }
    by_provider = {
        row[0]: row[1]
        for row in base.with_entities(
            RequestRecord.provider, func.count(RequestRecord.id)
        ).filter(RequestRecord.provider.isnot(None))
        .group_by(RequestRecord.provider).all()
    }

    return {
        "total_requests": total,
        "total_credits_used": int(credits_used),
        "by_modality": by_modality,
        "by_provider": by_provider,
    }


@router.get("/usage/daily")
def get_usage_daily(
    days: int = Query(default=30, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(
            func.date_trunc("day", RequestRecord.created_at).label("day"),
            func.count(RequestRecord.id).label("requests"),
            func.coalesce(func.sum(RequestRecord.credits_deducted), 0).label("credits"),
        )
        .filter(
            RequestRecord.user_id == current_user.id,
            RequestRecord.status == "success",
            RequestRecord.created_at >= since,
        )
        .group_by(func.date_trunc("day", RequestRecord.created_at))
        .order_by("day")
        .all()
    )

    return {
        "days": [
            {
                "date": row.day.strftime("%Y-%m-%d"),
                "requests": row.requests,
                "credits": int(row.credits),
            }
            for row in rows
        ]
    }


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
                "prompt": r.input_payload.get("prompt") if r.input_payload else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ],
    }
