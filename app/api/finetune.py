from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from typing import Any
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.finetune_job import FinetuneJob

router = APIRouter()

SUPPORTED_PROVIDERS = ["openai", "replicate", "fal"]


class FinetuneCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    provider: str
    base_model_id: str
    display_name: str | None = None
    training_file_url: str
    params: dict[str, Any] = {}


class FinetuneStatusUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    status: str
    external_job_id: str | None = None
    result_model_id: str | None = None
    error_message: str | None = None


@router.post("/finetune")
async def create_finetune(
    body: FinetuneCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail={"code": "UNSUPPORTED_PROVIDER", "message": f"Supported: {SUPPORTED_PROVIDERS}"})

    job = FinetuneJob(
        user_id=current_user.id,
        provider=body.provider,
        base_model_id=body.base_model_id,
        display_name=body.display_name,
        training_file_url=body.training_file_url,
        params=body.params,
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Attempt to submit to provider
    try:
        ext_id = await _submit_to_provider(body.provider, body.base_model_id, body.training_file_url, body.params, current_user, db)
        if ext_id:
            job.external_job_id = ext_id
            job.status = "running"
            db.commit()
    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        db.commit()

    db.refresh(job)
    return {"job": _ser(job)}


@router.get("/finetune")
def list_finetune_jobs(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    jobs = db.query(FinetuneJob).filter_by(user_id=current_user.id).order_by(FinetuneJob.created_at.desc()).all()
    return {"jobs": [_ser(j) for j in jobs]}


@router.get("/finetune/{job_id}")
def get_finetune_job(job_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.query(FinetuneJob).filter_by(id=job_id, user_id=current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Not found")
    return {"job": _ser(job)}


@router.post("/finetune/{job_id}/poll")
async def poll_finetune_job(job_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Poll provider for latest status."""
    job = db.query(FinetuneJob).filter_by(id=job_id, user_id=current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Not found")

    if not job.external_job_id:
        return {"job": _ser(job)}

    status, result_model = await _poll_provider(job.provider, job.external_job_id, current_user, db)
    if status:
        job.status = status
    if result_model:
        job.result_model_id = result_model
        job.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
    return {"job": _ser(job)}


@router.delete("/finetune/{job_id}")
def cancel_finetune(job_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.query(FinetuneJob).filter_by(id=job_id, user_id=current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Not found")
    job.status = "cancelled"
    job.completed_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


async def _submit_to_provider(provider: str, base_model: str, file_url: str, params: dict, user, db) -> str | None:
    from app.services.generate import _PLATFORM_KEYS
    api_key = _PLATFORM_KEYS.get(provider, "")
    if not api_key:
        raise ValueError(f"Provider '{provider}' is not configured on this platform")

    if provider == "openai":
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.openai.com/v1/fine_tuning/jobs",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"model": base_model, "training_file": file_url, **params},
            )
            if resp.status_code == 200:
                return resp.json().get("id")
    # Replicate / fal stubs — extend as needed
    return None


async def _poll_provider(provider: str, ext_id: str, user, db) -> tuple[str | None, str | None]:
    from app.services.generate import _PLATFORM_KEYS
    api_key = _PLATFORM_KEYS.get(provider, "")

    if provider == "openai" and api_key:
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.openai.com/v1/fine_tuning/jobs/{ext_id}",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                raw_status = data.get("status", "")
                status_map = {"succeeded": "succeeded", "failed": "failed", "running": "running", "queued": "queued", "cancelled": "cancelled"}
                status = status_map.get(raw_status)
                return status, data.get("fine_tuned_model")
    return None, None


def _ser(j: FinetuneJob) -> dict:
    return {
        "id": str(j.id),
        "provider": j.provider,
        "base_model_id": j.base_model_id,
        "display_name": j.display_name,
        "external_job_id": j.external_job_id,
        "status": j.status,
        "training_file_url": j.training_file_url,
        "result_model_id": j.result_model_id,
        "params": j.params,
        "error_message": j.error_message,
        "created_at": j.created_at.isoformat() if j.created_at else None,
        "completed_at": j.completed_at.isoformat() if j.completed_at else None,
    }
