"""Prompt template library: save and reuse prompts."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from typing import Any
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.prompt_template import PromptTemplate
import uuid

router = APIRouter()


class SaveTemplateRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    name: str
    prompt: str
    modality: str | None = None
    model_id: str | None = None
    params: dict[str, Any] | None = None


@router.post("/templates")
def save_template(
    body: SaveTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = PromptTemplate(
        id=uuid.uuid4(), user_id=current_user.id,
        name=body.name, prompt=body.prompt,
        modality=body.modality, model_id=body.model_id,
        params=body.params,
    )
    db.add(t)
    db.commit()
    return {"template": _ser(t)}


@router.get("/templates")
def list_templates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    templates = db.query(PromptTemplate).filter_by(user_id=current_user.id).order_by(PromptTemplate.created_at.desc()).all()
    return {"templates": [_ser(t) for t in templates]}


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = db.query(PromptTemplate).filter_by(id=template_id, user_id=current_user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found.")
    db.delete(t)
    db.commit()
    return {"ok": True}


def _ser(t: PromptTemplate) -> dict:
    return {"id": str(t.id), "name": t.name, "prompt": t.prompt, "modality": t.modality, "model_id": t.model_id, "params": t.params, "created_at": t.created_at.isoformat()}
