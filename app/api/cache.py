"""Prompt cache management — inspect hits, clear cache, toggle per-user."""
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.prompt_cache import PromptCache

router = APIRouter()


def cache_key(modality: str, model_id: str, prompt: str) -> str:
    raw = f"{modality}:{model_id}:{prompt}"
    return hashlib.sha256(raw.encode()).hexdigest()


def get_cached(db: Session, modality: str, model_id: str, prompt: str) -> PromptCache | None:
    key = cache_key(modality, model_id, prompt)
    entry = db.query(PromptCache).filter_by(cache_key=key).first()
    if not entry:
        return None
    if entry.expires_at and entry.expires_at < datetime.now(timezone.utc):
        db.delete(entry)
        db.commit()
        return None
    entry.hit_count += 1
    entry.last_hit_at = datetime.now(timezone.utc)
    db.commit()
    return entry


def store_cache(db: Session, modality: str, model_id: str, prompt: str, output_content: str | None, output_url: str | None, output_type: str, credits: float, ttl_hours: int = 24):
    key = cache_key(modality, model_id, prompt)
    existing = db.query(PromptCache).filter_by(cache_key=key).first()
    if existing:
        return
    from datetime import timedelta
    entry = PromptCache(
        cache_key=key,
        modality=modality,
        model_id=model_id,
        prompt_text=prompt[:2000],
        output_content=output_content,
        output_url=output_url,
        output_type=output_type,
        credits_saved=credits,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=ttl_hours),
    )
    db.add(entry)
    db.commit()


@router.get("/cache/stats")
def cache_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from sqlalchemy import func
    total = db.query(func.count(PromptCache.id)).scalar()
    hits = db.query(func.sum(PromptCache.hit_count)).scalar() or 0
    saved = db.query(func.sum(PromptCache.credits_saved)).scalar() or 0
    return {
        "total_entries": total,
        "total_hits": int(hits),
        "total_credits_saved": float(saved),
    }


@router.get("/cache/entries")
def list_cache_entries(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entries = db.query(PromptCache).order_by(PromptCache.hit_count.desc()).limit(limit).all()
    return {
        "entries": [
            {
                "id": str(e.id),
                "modality": e.modality,
                "model_id": e.model_id,
                "prompt_preview": e.prompt_text[:100] if e.prompt_text else "",
                "hit_count": e.hit_count,
                "credits_saved": float(e.credits_saved) if e.credits_saved else 0,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "expires_at": e.expires_at.isoformat() if e.expires_at else None,
            }
            for e in entries
        ]
    }


@router.delete("/cache/entries/{entry_id}")
def delete_cache_entry(entry_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    entry = db.query(PromptCache).filter_by(id=entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(entry)
    db.commit()
    return {"ok": True}


@router.delete("/cache/flush")
def flush_cache(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    db.query(PromptCache).delete()
    db.commit()
    return {"ok": True}
