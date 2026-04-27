from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from sqlalchemy.orm import Session
from app.telegram import service
from app.telegram import messages as msg

router = Router()


@router.message(Command("profile"))
async def cmd_profile(message: Message, db: Session):
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        await message.answer(msg.not_connected())
        return

    balance = service.get_balance(db, user.id)

    org_name: str | None = None
    if user.org_id:
        try:
            from app.models.organization import Organization
            org = db.query(Organization).filter_by(id=user.org_id).first()
            org_name = getattr(org, "name", None)
        except Exception:
            pass

    await message.answer(msg.profile(user, balance, org_name))


@router.message(Command("credits"))
async def cmd_credits(message: Message, db: Session):
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        await message.answer(msg.not_connected())
        return

    balance = service.get_balance(db, user.id)
    await message.answer(msg.credits_info(balance))
