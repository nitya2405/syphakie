"""Multi-modal pipeline API: define step chains, run them sequentially."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Any
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.pipeline import Pipeline, PipelineRun

router = APIRouter()


class PipelineStep(BaseModel):
    step: int
    modality: str          # "text" | "image" | "video" | "audio"
    model_id: str
    provider: str
    prompt_template: str   # may include {{input}} or {{step:N}} placeholders
    params: dict[str, Any] = {}


class PipelineCreate(BaseModel):
    name: str
    description: str | None = None
    steps: list[PipelineStep]
    is_public: bool = False


class PipelineRunRequest(BaseModel):
    input_prompt: str
    step_prompts: dict[str, str] | None = None   # step_num -> direct prompt, bypasses template
    params: dict[str, Any] = {}


@router.post("/pipelines")
def create_pipeline(
    body: PipelineCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pl = Pipeline(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        steps=[s.model_dump() for s in body.steps],
        is_public=body.is_public,
    )
    db.add(pl)
    db.commit()
    db.refresh(pl)
    return {"pipeline": _ser(pl)}


@router.get("/pipelines")
def list_pipelines(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pls = db.query(Pipeline).filter_by(user_id=current_user.id).order_by(Pipeline.created_at.desc()).all()
    return {"pipelines": [_ser(p) for p in pls]}


@router.get("/pipelines/public")
def list_public_pipelines(db: Session = Depends(get_db)):
    pls = db.query(Pipeline).filter_by(is_public=True).order_by(Pipeline.created_at.desc()).limit(50).all()
    return {"pipelines": [_ser(p) for p in pls]}


@router.get("/pipelines/{pl_id}")
def get_pipeline(pl_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pl = db.query(Pipeline).filter_by(id=pl_id, user_id=current_user.id).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Not found")
    return {"pipeline": _ser(pl)}


@router.delete("/pipelines/{pl_id}")
def delete_pipeline(pl_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pl = db.query(Pipeline).filter_by(id=pl_id, user_id=current_user.id).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Not found")
    
    # Delete associated runs
    db.query(PipelineRun).filter_by(pipeline_id=pl_id).delete()
    
    db.delete(pl)
    db.commit()
    return {"ok": True}


@router.post("/pipelines/{pl_id}/run")
async def run_pipeline(
    pl_id: str,
    body: PipelineRunRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pl = db.query(Pipeline).filter_by(id=pl_id, user_id=current_user.id).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Not found")

    run = PipelineRun(
        pipeline_id=str(pl.id),
        user_id=current_user.id,
        input_prompt=body.input_prompt,
        status="running",
        step_outputs={},
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    background_tasks.add_task(_execute_pipeline, str(run.id), str(current_user.id), pl.steps, body.input_prompt, body.params, body.step_prompts)
    return {"run_id": str(run.id), "status": "running"}


@router.get("/pipelines/runs/{run_id}")
def get_run(run_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = db.query(PipelineRun).filter_by(id=run_id, user_id=current_user.id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Not found")
    return {"run": _ser_run(run)}


@router.get("/pipelines/{pl_id}/runs")
def list_runs(pl_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    runs = (
        db.query(PipelineRun)
        .filter_by(pipeline_id=pl_id, user_id=current_user.id)
        .order_by(PipelineRun.started_at.desc())
        .limit(20)
        .all()
    )
    return {"runs": [_ser_run(r) for r in runs]}


async def _execute_pipeline(run_id: str, user_id: str, steps: list, input_prompt: str, extra_params: dict, step_prompts: dict | None = None):
    from app.db.session import SessionLocal
    from app.models.pipeline import PipelineRun
    from app.services.generate import GenerationService
    from app.models.user import User as UserModel
    from app.schemas.generate import GenerateRequest

    db = SessionLocal()
    try:
        run = db.query(PipelineRun).filter_by(id=run_id).first()
        user = db.query(UserModel).filter_by(id=user_id).first()
        if not run or not user:
            return

        step_outputs: dict = {}
        total_credits = 0

        for step_def in sorted(steps, key=lambda s: s["step"]):
            step_num = step_def["step"]
            prompt_tpl = step_def["prompt_template"]

            # Use direct prompt override if provided, else resolve template placeholders
            if step_prompts and str(step_num) in step_prompts:
                prompt = step_prompts[str(step_num)]
            else:
                prompt = prompt_tpl.replace("{{input}}", input_prompt)
                for prev_step, out in step_outputs.items():
                    prev_content = out.get("content") or out.get("url") or ""
                    prompt = prompt.replace(f"{{{{step:{prev_step}}}}}", prev_content)

            req = GenerateRequest(
                modality=step_def["modality"],
                mode="manual",
                prompt=prompt,
                model=step_def["model_id"],
                provider=step_def["provider"],
                params={**step_def.get("params", {}), **extra_params},
            )
            svc = GenerationService(db)
            try:
                result = await svc.run(user=user, request=req)
                step_outputs[str(step_num)] = {
                    "content": result.output.content,
                    "url": result.output.url,
                    "modality": step_def["modality"],
                    "credits": result.meta.credits_used,
                }
                total_credits += result.meta.credits_used
            except Exception as e:
                run.status = "failed"
                run.error_message = f"Step {step_num} failed: {str(e)}"
                run.step_outputs = step_outputs
                run.completed_at = datetime.now(timezone.utc)
                db.commit()
                return

        run.status = "completed"
        run.step_outputs = step_outputs
        run.total_credits = int(total_credits)
        run.completed_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


def _ser(p: Pipeline) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "description": p.description,
        "steps": p.steps,
        "is_public": p.is_public,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _ser_run(r: PipelineRun) -> dict:
    return {
        "id": str(r.id),
        "pipeline_id": str(r.pipeline_id),
        "status": r.status,
        "input_prompt": r.input_prompt,
        "step_outputs": r.step_outputs,
        "total_credits": r.total_credits,
        "error_message": r.error_message,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
    }
