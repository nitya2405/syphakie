"""Webhook management and delivery."""
import hashlib
import hmac
import json
import httpx
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Any
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.webhook import Webhook, WebhookDelivery

router = APIRouter()

WEBHOOK_EVENTS = [
    "generation.complete",
    "generation.failed",
    "credits.low",
    "pipeline.complete",
    "finetune.complete",
]


class WebhookCreate(BaseModel):
    url: str
    secret: str | None = None
    events: list[str] = ["generation.complete"]


class WebhookUpdate(BaseModel):
    url: str | None = None
    events: list[str] | None = None
    is_active: bool | None = None


@router.get("/webhooks")
def list_webhooks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hooks = db.query(Webhook).filter_by(user_id=current_user.id).all()
    return {"webhooks": [_serialize(h) for h in hooks]}


@router.post("/webhooks")
def create_webhook(
    body: WebhookCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invalid = [e for e in body.events if e not in WEBHOOK_EVENTS]
    if invalid:
        raise HTTPException(status_code=400, detail={"code": "INVALID_EVENTS", "message": f"Unknown events: {invalid}"})
    hook = Webhook(user_id=current_user.id, url=body.url, secret=body.secret, events=body.events)
    db.add(hook)
    db.commit()
    db.refresh(hook)
    return {"webhook": _serialize(hook)}


@router.patch("/webhooks/{hook_id}")
def update_webhook(
    hook_id: str,
    body: WebhookUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hook = db.query(Webhook).filter_by(id=hook_id, user_id=current_user.id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Not found")
    if body.url is not None:
        hook.url = body.url
    if body.events is not None:
        hook.events = body.events
    if body.is_active is not None:
        hook.is_active = body.is_active
    db.commit()
    return {"webhook": _serialize(hook)}


@router.delete("/webhooks/{hook_id}")
def delete_webhook(hook_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hook = db.query(Webhook).filter_by(id=hook_id, user_id=current_user.id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(hook)
    db.commit()
    return {"ok": True}


@router.get("/webhooks/{hook_id}/deliveries")
def webhook_deliveries(hook_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hook = db.query(Webhook).filter_by(id=hook_id, user_id=current_user.id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Not found")
    deliveries = (
        db.query(WebhookDelivery)
        .filter_by(webhook_id=hook_id)
        .order_by(WebhookDelivery.created_at.desc())
        .limit(50)
        .all()
    )
    return {"deliveries": [_ser_delivery(d) for d in deliveries]}


@router.post("/webhooks/{hook_id}/test")
async def test_webhook(
    hook_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hook = db.query(Webhook).filter_by(id=hook_id, user_id=current_user.id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Not found")
    payload = {"event": "test", "message": "SyphaKie webhook test", "timestamp": datetime.now(timezone.utc).isoformat()}
    delivery = WebhookDelivery(webhook_id=str(hook.id), event="test", payload=payload)
    db.add(delivery)
    db.commit()
    db.refresh(delivery)
    background_tasks.add_task(_deliver, str(delivery.id), hook.url, hook.secret, payload)
    return {"ok": True, "delivery_id": str(delivery.id)}


async def dispatch_webhook(db: Session, user_id: str, event: str, payload: dict):
    """Called internally after generation/pipeline completion."""
    hooks = db.query(Webhook).filter(
        Webhook.user_id == user_id,
        Webhook.is_active == True,
    ).all()
    for hook in hooks:
        if event not in (hook.events or []):
            continue
        delivery = WebhookDelivery(webhook_id=str(hook.id), event=event, payload=payload)
        db.add(delivery)
        db.commit()
        db.refresh(delivery)
        # Fire-and-forget; caller handles background tasks
        import asyncio
        asyncio.create_task(_deliver(str(delivery.id), hook.url, hook.secret, payload))


async def _deliver(delivery_id: str, url: str, secret: str | None, payload: dict):
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        delivery = db.query(WebhookDelivery).filter_by(id=delivery_id).first()
        if not delivery:
            return
        body_bytes = json.dumps(payload).encode()
        headers = {"Content-Type": "application/json", "X-Syphakie-Event": payload.get("event", "")}
        if secret:
            sig = hmac.new(secret.encode(), body_bytes, hashlib.sha256).hexdigest()  # hmac.new exists in stdlib
            headers["X-Syphakie-Signature"] = f"sha256={sig}"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, content=body_bytes, headers=headers)
            delivery.status = "delivered" if resp.status_code < 300 else "failed"
            delivery.last_response_code = resp.status_code
            delivery.attempts = (delivery.attempts or 0) + 1
            if delivery.status == "delivered":
                delivery.delivered_at = datetime.now(timezone.utc)
            else:
                delivery.next_retry_at = datetime.now(timezone.utc) + timedelta(minutes=5 * (delivery.attempts or 1))
        except Exception as e:
            delivery.status = "failed"
            delivery.last_error = str(e)
            delivery.attempts = (delivery.attempts or 0) + 1
            delivery.next_retry_at = datetime.now(timezone.utc) + timedelta(minutes=5)
        db.commit()
    finally:
        db.close()


def _serialize(h: Webhook) -> dict:
    return {
        "id": str(h.id),
        "url": h.url,
        "events": h.events,
        "is_active": h.is_active,
        "created_at": h.created_at.isoformat() if h.created_at else None,
    }


def _ser_delivery(d: WebhookDelivery) -> dict:
    return {
        "id": str(d.id),
        "event": d.event,
        "status": d.status,
        "attempts": d.attempts,
        "last_response_code": d.last_response_code,
        "last_error": d.last_error,
        "delivered_at": d.delivered_at.isoformat() if d.delivered_at else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }
