"""
FastAPI routes for Telegram integration.

  POST /api/v1/telegram/token        — generate deep-link auth token (requires X-API-Key)
  GET  /api/v1/telegram/status       — check if user has Telegram connected
  DELETE /api/v1/telegram/connection — disconnect

  POST /telegram/webhook             — receive updates from Telegram (webhook mode only)
"""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.telegram import service as tg_service
from app.config import settings

# Auth-protected endpoints (mounted under /api/v1)
router = APIRouter()

# Webhook receiver (mounted at root, no /api/v1 prefix)
webhook_router = APIRouter()
logger = logging.getLogger(__name__)


# ── Auth-protected platform endpoints ─────────────────────────────────────────

@router.post("/telegram/token")
def get_telegram_token(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a one-time deep-link token valid for 5 minutes."""
    if not settings.TELEGRAM_BOT_TOKEN:
        raise HTTPException(
            status_code=503,
            detail={"code": "TELEGRAM_DISABLED", "message": "Telegram integration is not configured."},
        )
    if not settings.TELEGRAM_BOT_USERNAME:
        raise HTTPException(
            status_code=503,
            detail={"code": "TELEGRAM_NOT_CONFIGURED", "message": "TELEGRAM_BOT_USERNAME is not set."},
        )

    token = tg_service.create_auth_token(db, current_user.id)
    deep_link = f"https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start=auth_{token}"
    bot_url = f"https://t.me/{settings.TELEGRAM_BOT_USERNAME}"
    return {"token": token, "deep_link": deep_link, "bot_url": bot_url, "expires_in": 300}


@router.get("/telegram/status")
def telegram_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models.telegram_connection import TelegramConnection
    conn = db.query(TelegramConnection).filter_by(
        user_id=current_user.id, is_active=True
    ).first()
    if not conn:
        return {"connected": False}
    return {
        "connected": True,
        "username": conn.username,
        "connected_at": conn.connected_at.isoformat() if conn.connected_at else None,
    }


@router.delete("/telegram/connection")
def disconnect_telegram(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tg_service.deactivate_connection(db, current_user.id)
    return {"ok": True}


# ── Telegram webhook receiver (no auth — verified via secret token header) ────

@webhook_router.post("/telegram/webhook", include_in_schema=False)
async def telegram_webhook(request: Request):
    from app.telegram import get_bot, get_dp
    from aiogram.types import Update

    bot = get_bot()
    dp = get_dp()
    if bot is None or dp is None:
        raise HTTPException(status_code=503, detail="Bot not initialised")

    # Verify Telegram's secret_token header when configured
    if settings.TELEGRAM_WEBHOOK_SECRET:
        incoming = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if incoming != settings.TELEGRAM_WEBHOOK_SECRET:
            raise HTTPException(status_code=403, detail="Bad webhook secret")

    body = await request.body()
    try:
        update = Update.model_validate(json.loads(body))
    except Exception as exc:
        logger.warning("Could not parse Telegram update: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid update payload")

    await dp.feed_update(bot, update)
    return {"ok": True}
