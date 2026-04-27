from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from sqlalchemy.orm import Session
from app.telegram import service, keyboards
from app.telegram import messages as msg

router = Router()


@router.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer(
        "*SyphaKie Bot — Commands*\n\n"
        "⚡ *Quick generate*\n"
        "/q \\[prompt\\]  — Generate text \\(auto model\\)\n"
        "/img \\[prompt\\] — Generate image \\(auto model\\)\n\n"
        "🎛 *Full flow*\n"
        "/generate — Choose modality, model \\+ prompt\n\n"
        "📊 *Account*\n"
        "/profile  — View your account\n"
        "/credits  — Check credit balance\n"
        "/usage    — Generation stats\n"
        "/topup    — Add more credits\n"
        "/history  — Last 5 generations\n\n"
        "⚙️ *Settings*\n"
        "/setdefault \\[modality\\] \\[model\\] — Set default model\n\n"
        "🔧 *Other*\n"
        "/cancel   — Cancel current operation\n"
        "/logout   — Disconnect Telegram\n"
        "/help     — Show this message\n\n"
        "💡 You can also send a *voice message* or *photo* anytime\\!"
    )


@router.message(Command("cancel"))
async def cmd_cancel(message: Message, state: FSMContext, db: Session):
    fsm_state = await state.get_state()
    user = service.get_user_by_chat_id(db, message.chat.id)
    db_state = service.get_state(db, user.id) if user else None

    if fsm_state is None and db_state is None:
        await message.answer("Nothing to cancel\\.")
        return

    await state.clear()
    if user:
        service.clear_state(db, user.id)
    await message.answer("✕ Cancelled\\.")


@router.message(Command("logout"))
async def cmd_logout(message: Message, db: Session):
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        await message.answer("Not connected\\.")
        return
    await message.answer(
        "Disconnect your Telegram from SyphaKie?",
        reply_markup=keyboards.logout_kb(),
    )


@router.callback_query(lambda c: c.data.startswith("logout:"))
async def logout_callback(cb: CallbackQuery, db: Session):
    action = cb.data.split(":")[1]
    if action == "confirm":
        user = service.get_user_by_chat_id(db, cb.message.chat.id)
        if user:
            service.deactivate_connection(db, user.id)
        await cb.message.edit_text(
            "✅ Disconnected\\. Your data is preserved\\.\n\n"
            "Use /start with a new link to reconnect\\."
        )
    else:
        await cb.message.edit_text("✓ Kept connected\\.")
    await cb.answer()
