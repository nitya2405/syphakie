import secrets
from datetime import datetime, timezone, timedelta
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.telegram_connection import TelegramConnection
from app.models.telegram_auth_token import TelegramAuthToken
from app.models.telegram_state import TelegramState
from app.models.credit import Credit
from app.models.model_registry import ModelRegistry
from app.models.request_record import RequestRecord

_STATE_TTL_MINUTES = 30
_TOKEN_TTL_MINUTES = 5


# ── Connection ────────────────────────────────────────────────────────────────

def get_connection_by_chat_id(db: Session, chat_id: int) -> TelegramConnection | None:
    return db.query(TelegramConnection).filter_by(chat_id=chat_id, is_active=True).first()


def get_user_by_chat_id(db: Session, chat_id: int) -> User | None:
    conn = get_connection_by_chat_id(db, chat_id)
    if not conn:
        return None
    return db.query(User).filter_by(id=conn.user_id, is_active=True).first()


def save_connection(db: Session, user_id, chat_id: int, username: str | None) -> TelegramConnection:
    conn = db.query(TelegramConnection).filter_by(user_id=user_id).first()
    if conn:
        conn.chat_id = chat_id
        conn.username = username
        conn.is_active = True
    else:
        conn = TelegramConnection(user_id=user_id, chat_id=chat_id, username=username)
        db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


def deactivate_connection(db: Session, user_id) -> None:
    conn = db.query(TelegramConnection).filter_by(user_id=user_id).first()
    if conn:
        conn.is_active = False
        db.commit()


# ── Auth tokens ───────────────────────────────────────────────────────────────

def create_auth_token(db: Session, user_id) -> str:
    # Invalidate previous unused tokens for this user
    db.query(TelegramAuthToken).filter(
        TelegramAuthToken.user_id == user_id,
        TelegramAuthToken.used_at.is_(None),
    ).delete()

    token = secrets.token_urlsafe(32)
    record = TelegramAuthToken(
        user_id=user_id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=_TOKEN_TTL_MINUTES),
    )
    db.add(record)
    db.commit()
    return token


def consume_auth_token(db: Session, token: str) -> TelegramAuthToken | None:
    record = db.query(TelegramAuthToken).filter(
        TelegramAuthToken.token == token,
        TelegramAuthToken.used_at.is_(None),
        TelegramAuthToken.expires_at > datetime.now(timezone.utc),
    ).first()
    if not record:
        return None
    record.used_at = datetime.now(timezone.utc)
    db.commit()
    return record


# ── Conversational state (async job tracking) ─────────────────────────────────

def get_state(db: Session, user_id) -> TelegramState | None:
    state = db.query(TelegramState).filter_by(user_id=user_id).first()
    if state and state.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        db.delete(state)
        db.commit()
        return None
    return state


def set_state(db: Session, user_id, chat_id: int, state: str, data: dict) -> None:
    record = db.query(TelegramState).filter_by(user_id=user_id).first()
    expires = datetime.now(timezone.utc) + timedelta(minutes=_STATE_TTL_MINUTES)
    if record:
        record.state = state
        record.data = data
        record.chat_id = chat_id
        record.expires_at = expires
    else:
        record = TelegramState(
            user_id=user_id,
            chat_id=chat_id,
            state=state,
            data=data,
            expires_at=expires,
        )
        db.add(record)
    db.commit()


def clear_state(db: Session, user_id) -> None:
    db.query(TelegramState).filter_by(user_id=user_id).delete()
    db.commit()


# ── Balance & data helpers ────────────────────────────────────────────────────

def get_all_active_connections(db: Session) -> list[TelegramConnection]:
    return db.query(TelegramConnection).filter_by(is_active=True).all()


def get_preferences(db: Session, user_id) -> dict:
    conn = db.query(TelegramConnection).filter_by(user_id=user_id, is_active=True).first()
    if not conn:
        return {}
    return conn.preferences or {}


def set_preference(db: Session, user_id, key: str, value: str) -> None:
    conn = db.query(TelegramConnection).filter_by(user_id=user_id, is_active=True).first()
    if not conn:
        return
    prefs = dict(conn.preferences or {})
    prefs[key] = value
    conn.preferences = prefs
    db.commit()


def get_usage_stats(db: Session, user_id) -> dict:
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today.replace(day=1)

    base = db.query(RequestRecord).filter(
        RequestRecord.user_id == user_id,
        RequestRecord.status == "success",
    )
    total_req = base.count()
    total_cr = base.with_entities(func.coalesce(func.sum(RequestRecord.credits_deducted), 0)).scalar()
    today_req = base.filter(RequestRecord.created_at >= today).count()
    today_cr = base.filter(RequestRecord.created_at >= today).with_entities(
        func.coalesce(func.sum(RequestRecord.credits_deducted), 0)
    ).scalar()
    month_req = base.filter(RequestRecord.created_at >= month_start).count()
    month_cr = base.filter(RequestRecord.created_at >= month_start).with_entities(
        func.coalesce(func.sum(RequestRecord.credits_deducted), 0)
    ).scalar()

    rows = base.with_entities(RequestRecord.modality, func.count()).group_by(RequestRecord.modality).all()
    by_modality = {r[0] or "unknown": r[1] for r in rows}

    return {
        "total_requests": total_req,
        "total_credits": int(total_cr),
        "today_requests": today_req,
        "today_credits": int(today_cr),
        "month_requests": month_req,
        "month_credits": int(month_cr),
        "by_modality": by_modality,
    }


def get_balance(db: Session, user_id) -> int:
    credit = db.query(Credit).filter_by(user_id=user_id).first()
    return credit.balance if credit else 0


def get_top_models(db: Session, modality: str, limit: int = 15) -> list[ModelRegistry]:
    return (
        db.query(ModelRegistry)
        .filter_by(modality=modality, is_active=True)
        .order_by(ModelRegistry.quality_score.desc().nullslast())
        .limit(limit)
        .all()
    )


def get_recent_history(db: Session, user_id, limit: int = 5) -> list[RequestRecord]:
    return (
        db.query(RequestRecord)
        .filter_by(user_id=user_id)
        .order_by(RequestRecord.created_at.desc())
        .limit(limit)
        .all()
    )
