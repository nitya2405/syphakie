from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, case, text
from datetime import datetime, timedelta, timezone
from app.api.deps import get_current_user, get_db
from app.models.request_record import RequestRecord
from app.models.user import User

router = APIRouter()


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


@router.get("/usage/summary")
def get_usage_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    base = db.query(RequestRecord).filter(RequestRecord.user_id == current_user.id)
    success = base.filter(RequestRecord.status == "success")
    total = base.count()
    success_count = success.count()
    failed_count = base.filter(RequestRecord.status == "failed").count()
    credits_used = success.with_entities(func.coalesce(func.sum(RequestRecord.credits_deducted), 0)).scalar()
    avg_latency = success.with_entities(func.avg(RequestRecord.latency_ms)).scalar()
    by_modality = {row[0]: row[1] for row in success.with_entities(RequestRecord.modality, func.count(RequestRecord.id)).group_by(RequestRecord.modality).all()}
    by_provider = {row[0]: row[1] for row in success.with_entities(RequestRecord.provider, func.count(RequestRecord.id)).filter(RequestRecord.provider.isnot(None)).group_by(RequestRecord.provider).all()}
    return {
        "total_requests": total,
        "success_count": success_count,
        "failed_count": failed_count,
        "error_rate": round(failed_count / total, 4) if total else 0,
        "total_credits_used": int(credits_used),
        "avg_latency_ms": round(float(avg_latency), 1) if avg_latency else None,
        "by_modality": by_modality,
        "by_provider": by_provider,
    }


@router.get("/usage/by-model")
def get_usage_by_model(days: int = Query(default=30, ge=1, le=365), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    since = _since(days)
    rows = (
        db.query(RequestRecord.model_id, RequestRecord.provider, RequestRecord.modality,
            func.count(RequestRecord.id).label("requests"),
            func.coalesce(func.sum(RequestRecord.credits_deducted), 0).label("credits"),
            func.avg(RequestRecord.latency_ms).label("avg_latency"),
            func.min(RequestRecord.latency_ms).label("min_latency"),
            func.max(RequestRecord.latency_ms).label("max_latency"),
            func.count(case((RequestRecord.status == "failed", 1))).label("errors"),
        )
        .filter(RequestRecord.user_id == current_user.id, RequestRecord.model_id.isnot(None), RequestRecord.created_at >= since)
        .group_by(RequestRecord.model_id, RequestRecord.provider, RequestRecord.modality)
        .order_by(desc("credits")).all()
    )
    return {"days": days, "models": [{"model_id": r.model_id, "provider": r.provider, "modality": r.modality, "requests": r.requests, "credits": int(r.credits), "avg_latency_ms": round(float(r.avg_latency), 1) if r.avg_latency else None, "min_latency_ms": r.min_latency, "max_latency_ms": r.max_latency, "errors": r.errors, "error_rate": round(r.errors / r.requests, 4) if r.requests else 0} for r in rows]}


@router.get("/usage/by-provider")
def get_usage_by_provider(days: int = Query(default=30, ge=1, le=365), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    since = _since(days)
    rows = (
        db.query(RequestRecord.provider,
            func.count(RequestRecord.id).label("requests"),
            func.coalesce(func.sum(RequestRecord.credits_deducted), 0).label("credits"),
            func.avg(RequestRecord.latency_ms).label("avg_latency"),
            func.count(case((RequestRecord.status == "failed", 1))).label("errors"),
        )
        .filter(RequestRecord.user_id == current_user.id, RequestRecord.provider.isnot(None), RequestRecord.created_at >= since)
        .group_by(RequestRecord.provider).order_by(desc("credits")).all()
    )
    return {"days": days, "providers": [{"provider": r.provider, "requests": r.requests, "credits": int(r.credits), "avg_latency_ms": round(float(r.avg_latency), 1) if r.avg_latency else None, "errors": r.errors, "error_rate": round(r.errors / r.requests, 4) if r.requests else 0} for r in rows]}


@router.get("/usage/daily")
def get_usage_daily(days: int = Query(default=30, ge=1, le=90), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    since = _since(days)
    rows = (
        db.query(
            func.date_trunc("day", RequestRecord.created_at).label("day"),
            func.count(RequestRecord.id).label("requests"),
            func.coalesce(func.sum(RequestRecord.credits_deducted), 0).label("credits"),
            func.count(case((RequestRecord.status == "failed", 1))).label("errors"),
            func.avg(RequestRecord.latency_ms).label("avg_latency"),
        )
        .filter(RequestRecord.user_id == current_user.id, RequestRecord.created_at >= since)
        .group_by(func.date_trunc("day", RequestRecord.created_at)).order_by("day").all()
    )
    return {"days": [{"date": row.day.strftime("%Y-%m-%d"), "requests": row.requests, "credits": int(row.credits), "errors": row.errors, "avg_latency_ms": round(float(row.avg_latency), 1) if row.avg_latency else None} for row in rows]}


@router.get("/usage/latency-percentiles")
def get_latency_percentiles(days: int = Query(default=7, ge=1, le=90), provider: str | None = Query(default=None), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    since = _since(days)
    filters = [
        RequestRecord.user_id == current_user.id,
        RequestRecord.status == "success",
        RequestRecord.latency_ms.isnot(None),
        RequestRecord.created_at >= since,
    ]
    if provider:
        filters.append(RequestRecord.provider == provider)

    pct = lambda p: func.percentile_cont(p).within_group(RequestRecord.latency_ms)
    row = db.query(
        func.count(RequestRecord.id).label("count"),
        pct(0.50).label("p50"),
        pct(0.75).label("p75"),
        pct(0.90).label("p90"),
        pct(0.95).label("p95"),
        pct(0.99).label("p99"),
        func.min(RequestRecord.latency_ms).label("min"),
        func.max(RequestRecord.latency_ms).label("max"),
    ).filter(*filters).one()

    if not row.count:
        return {"p50": None, "p75": None, "p90": None, "p95": None, "p99": None, "count": 0}
    return {"count": row.count, "p50": row.p50, "p75": row.p75, "p90": row.p90, "p95": row.p95, "p99": row.p99, "min": row.min, "max": row.max}


@router.get("/usage")
def get_usage(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    modality: str | None = Query(default=None),
    provider: str | None = Query(default=None),
    status: str | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(RequestRecord).filter(RequestRecord.user_id == current_user.id)

    if modality:
        query = query.filter(RequestRecord.modality == modality)
    if provider:
        query = query.filter(RequestRecord.provider == provider)
    if status:
        query = query.filter(RequestRecord.status == status)
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
                "output_url": r.output_url,
                "output_path": r.output_path,
            }
            for r in records
        ],
    }
