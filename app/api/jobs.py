"""Async generation jobs: create, poll status, fetch results."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.models.job import Job
from app.models.user import User

router = APIRouter()


def _serialize(job: Job) -> dict:
    return {
        "id": str(job.id),
        "status": job.status,
        "modality": job.modality,
        "model_id": job.model_id,
        "provider": job.provider,
        "output_url": job.output_url,
        "output_content": job.output_content,
        "error_message": job.error_message,
        "credits_used": job.credits_used,
        "request_id": job.request_id,
        "created_at": job.created_at.isoformat(),
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


@router.get("/jobs")
def list_jobs(
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    jobs = (
        db.query(Job)
        .filter(Job.user_id == current_user.id)
        .order_by(Job.created_at.desc())
        .limit(limit)
        .all()
    )
    return {"jobs": [_serialize(j) for j in jobs]}


@router.get("/jobs/{job_id}/status")
def get_job_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == uuid.UUID(job_id), Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Job not found."})
    return {
        "status": job.status,
        "error_message": job.error_message,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


@router.get("/jobs/{job_id}")
def get_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == uuid.UUID(job_id), Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Job not found."})
    return {"job": _serialize(job)}
