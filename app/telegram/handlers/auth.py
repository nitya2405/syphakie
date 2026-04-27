import logging
from aiogram import Router
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import Message
from sqlalchemy.orm import Session
from app.telegram import service
from app.telegram import messages as msg

router = Router()
logger = logging.getLogger(__name__)


@router.message(CommandStart())
async def start_handler(message: Message, command: CommandObject, db: Session):
    arg = command.args or ""

    # ── Deep-link auth flow ───────────────────────────────────────────────────
    if arg.startswith("auth_"):
        token = arg[5:]
        record = service.consume_auth_token(db, token)

        if not record:
            await message.answer(msg.token_expired())
            return

        chat_id = message.chat.id
        username = message.from_user.username if message.from_user else None
        service.save_connection(db, record.user_id, chat_id, username)

        from app.models.user import User
        user = db.query(User).filter_by(id=record.user_id).first()
        balance = service.get_balance(db, user.id)

        org_name: str | None = None
        if user.org_id:
            try:
                from app.models.organization import Organization
                org = db.query(Organization).filter_by(id=user.org_id).first()
                org_name = getattr(org, "name", None)
            except Exception:
                pass

        await message.answer(msg.welcome(user.email, org_name, balance))
        logger.info("Telegram connected: user=%s chat=%s", user.id, chat_id)
        return

    # ── Plain /start (no token) ───────────────────────────────────────────────
    user = service.get_user_by_chat_id(db, message.chat.id)
    if user:
        await message.answer(msg.already_connected(user.email))
    else:
        await message.answer(msg.not_connected())
