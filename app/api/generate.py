import uuid as _uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.schemas.generate import GenerateRequest, GenerateResponse
from app.services.generate import GenerationService
from app.models.user import User
from app.models.job import Job

router = APIRouter()


async def _run_job(job_id: str, user_id: str, request: GenerateRequest) -> None:
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == _uuid.UUID(job_id)).first()
        if not job:
            return
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        user = db.query(User).filter(User.id == _uuid.UUID(user_id)).first()
        service = GenerationService(db)
        result = await service.run(user=user, request=request)

        job.status = "success"
        job.modality = result.modality
        job.model_id = result.model
        job.provider = result.provider
        job.output_url = result.output.url
        job.output_content = result.output.content
        job.credits_used = result.meta.credits_used
        job.request_id = result.request_id
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        try:
            db.rollback()
            job = db.query(Job).filter(Job.id == _uuid.UUID(job_id)).first()
            if job:
                job.status = "failed"
                job.error_message = str(e)
                job.completed_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/generate")
async def generate(
    body: GenerateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.async_job:
        job = Job(
            id=_uuid.uuid4(),
            user_id=current_user.id,
            status="queued",
            modality=body.modality,
            input_payload=body.model_dump(exclude={"async_job"}),
        )
        db.add(job)
        db.commit()
        background_tasks.add_task(_run_job, str(job.id), str(current_user.id), body)
        return {"job_id": str(job.id), "status": "queued"}

    service = GenerationService(db)
    return await service.run(user=current_user, request=body)
