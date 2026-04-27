"""A/B model routing experiments."""
import random
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from pydantic import BaseModel
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.ab_experiment import ABExperiment, ABResult

router = APIRouter()


class VariantSpec(BaseModel):
    model_id: str
    provider: str
    weight: int = 50  # percent, must sum to 100


class ExperimentCreate(BaseModel):
    name: str
    modality: str
    variants: list[VariantSpec]


@router.post("/experiments")
def create_experiment(
    body: ExperimentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if len(body.variants) < 2:
        raise HTTPException(status_code=400, detail={"code": "MIN_VARIANTS", "message": "Need at least 2 variants."})
    total_weight = sum(v.weight for v in body.variants)
    if total_weight != 100:
        raise HTTPException(status_code=400, detail={"code": "WEIGHT_SUM", "message": "Variant weights must sum to 100."})

    exp = ABExperiment(
        user_id=current_user.id,
        name=body.name,
        modality=body.modality,
        variants=[v.model_dump() for v in body.variants],
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return {"experiment": _ser(exp)}


@router.get("/experiments")
def list_experiments(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    exps = db.query(ABExperiment).filter_by(user_id=current_user.id).order_by(ABExperiment.created_at.desc()).all()
    return {"experiments": [_ser(e) for e in exps]}


@router.get("/experiments/{exp_id}")
def get_experiment(exp_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    exp = db.query(ABExperiment).filter_by(id=exp_id, user_id=current_user.id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Not found")

    # Aggregate results per variant
    rows = (
        db.query(
            ABResult.model_id,
            func.count(ABResult.id).label("requests"),
            func.avg(ABResult.latency_ms).label("avg_latency"),
            func.avg(ABResult.credits_used).label("avg_credits"),
            func.avg(ABResult.rating).label("avg_rating"),
        )
        .filter_by(experiment_id=exp_id)
        .group_by(ABResult.model_id)
        .all()
    )
    stats = {
        r.model_id: {
            "requests": r.requests,
            "avg_latency_ms": int(r.avg_latency) if r.avg_latency else None,
            "avg_credits": round(float(r.avg_credits), 4) if r.avg_credits else None,
            "avg_rating": round(float(r.avg_rating), 2) if r.avg_rating else None,
        }
        for r in rows
    }
    return {"experiment": _ser(exp), "stats": stats}


@router.post("/experiments/{exp_id}/route")
def route_experiment(exp_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Pick a variant based on weights. Returns the model to use."""
    exp = db.query(ABExperiment).filter_by(id=exp_id, user_id=current_user.id, status="active").first()
    if not exp:
        raise HTTPException(status_code=404, detail="Active experiment not found")

    variants = exp.variants
    weights = [v["weight"] for v in variants]
    chosen = random.choices(variants, weights=weights, k=1)[0]
    return {"model_id": chosen["model_id"], "provider": chosen["provider"]}


@router.post("/experiments/{exp_id}/conclude")
def conclude_experiment(
    exp_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exp = db.query(ABExperiment).filter_by(id=exp_id, user_id=current_user.id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Not found")

    # Auto-pick winner by avg_rating, fallback to avg_latency
    rows = (
        db.query(ABResult.model_id, func.avg(ABResult.rating).label("avg_r"), func.avg(ABResult.latency_ms).label("avg_l"))
        .filter_by(experiment_id=exp_id)
        .group_by(ABResult.model_id)
        .all()
    )
    if rows:
        best = max(rows, key=lambda r: (float(r.avg_r or 0), -float(r.avg_l or 9999)))
        exp.winner_model_id = best.model_id

    exp.status = "concluded"
    exp.concluded_at = datetime.now(timezone.utc)
    db.commit()
    return {"experiment": _ser(exp)}


@router.delete("/experiments/{exp_id}")
def delete_experiment(exp_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    exp = db.query(ABExperiment).filter_by(id=exp_id, user_id=current_user.id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(exp)
    db.commit()
    return {"ok": True}


def _ser(e: ABExperiment) -> dict:
    return {
        "id": str(e.id),
        "name": e.name,
        "modality": e.modality,
        "variants": e.variants,
        "status": e.status,
        "winner_model_id": e.winner_model_id,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "concluded_at": e.concluded_at.isoformat() if e.concluded_at else None,
    }
