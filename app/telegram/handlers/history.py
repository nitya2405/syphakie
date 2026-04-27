from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from sqlalchemy.orm import Session
from app.telegram import service
from app.telegram import messages as msg

router = Router()


@router.message(Command("history"))
async def cmd_history(message: Message, db: Session):
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        await message.answer(msg.not_connected())
        return

    records = service.get_recent_history(db, user.id)
    await message.answer(msg.history_list(records), disable_web_page_preview=True)
