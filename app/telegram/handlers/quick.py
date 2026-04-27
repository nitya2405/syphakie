"""Quick-generate commands, usage stats, credit top-up, admin broadcast, model defaults, rating."""
import logging
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from sqlalchemy.orm import Session
from app.telegram import service, keyboards
from app.telegram import messages as msg
from app.telegram.messages import _esc
from app.telegram.states import Gen

router = Router()
logger = logging.getLogger(__name__)

_QUICK_MODALITY = {"q": "text", "img": "image"}


async def _run_quick(message: Message, db: Session, modality: str, prompt: str):
    from app.services.generate import GenerationService
    from app.schemas.generate import GenerateRequest
    from fastapi import HTTPException

    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        await message.answer(msg.not_connected())
        return

    prefs = service.get_preferences(db, user.id)
    default_model = prefs.get(f"default_{modality}")

    thinking = await message.answer(f"⏳ Generating *{modality}*…")

    request = GenerateRequest(
        modality=modality,
        mode="auto",
        prompt=prompt,
        model=default_model,
    )

    try:
        result = await GenerationService(db).run(user=user, request=request)
    except HTTPException as e:
        detail = e.detail if isinstance(e.detail, dict) else {}
        if e.status_code == 402:
            balance = service.get_balance(db, user.id)
            await thinking.edit_text(
                f"❌ *Insufficient credits*\n\nBalance: *{balance:,}*",
            )
        else:
            await thinking.edit_text(
                msg.generation_failed({"error": detail.get("message", str(e))}),
                reply_markup=keyboards.retry_kb(),
            )
        return
    except Exception as e:
        await thinking.edit_text(
            msg.generation_failed({"error": str(e)}),
            reply_markup=keyboards.retry_kb(),
        )
        logger.error("Quick generate error: %s", e, exc_info=True)
        return

    payload = {
        "modality": modality,
        "model": result.model,
        "prompt": prompt,
        "credits_used": result.meta.credits_used,
        "credits_remaining": result.meta.credits_remaining,
        "output_content": result.output.content,
        "output_url": result.output.url,
    }
    text = msg.generation_complete(payload)
    url = result.output.url
    kb = keyboards.rate_kb(result.request_id)

    try:
        if url and modality == "image":
            await thinking.delete()
            await message.answer_photo(url, caption=text[:1024], reply_markup=kb)
        else:
            await thinking.edit_text(text, reply_markup=kb)
    except Exception as e:
        logger.warning("Quick generate send error: %s", e)
        await thinking.edit_text(text + (f"\n[View]({url})" if url else ""), reply_markup=kb)


# ── /q [prompt] — quick text ──────────────────────────────────────────────────

@router.message(Command("q"))
async def cmd_quick_text(message: Message, state: FSMContext, db: Session):
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        await message.answer(msg.not_connected())
        return
    prompt = (message.text or "").split(None, 1)[1].strip() if " " in (message.text or "") else ""
    if not prompt:
        await state.update_data(modality="text", model_id=None, provider=None, model_name="Auto")
        await state.set_state(Gen.prompt)
        await message.answer("Enter your text prompt:")
        return
    await _run_quick(message, db, "text", prompt)


# ── /img [prompt] — quick image ───────────────────────────────────────────────

@router.message(Command("img"))
async def cmd_quick_image(message: Message, state: FSMContext, db: Session):
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        await message.answer(msg.not_connected())
        return
    prompt = (message.text or "").split(None, 1)[1].strip() if " " in (message.text or "") else ""
    if not prompt:
        await state.update_data(modality="image", model_id=None, provider=None, model_name="Auto")
        await state.set_state(Gen.prompt)
        await message.answer("Enter your image prompt:")
        return
    await _run_quick(message, db, "image", prompt)


# ── /usage — stats ────────────────────────────────────────────────────────────

@router.message(Command("usage"))
async def cmd_usage(message: Message, db: Session):
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        await message.answer(msg.not_connected())
        return
    stats = service.get_usage_stats(db, user.id)
    await message.answer(msg.usage_stats(stats))


# ── /topup — show balance + link ──────────────────────────────────────────────

@router.message(Command("topup"))
async def cmd_topup(message: Message, db: Session):
    from app.config import settings
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        await message.answer(msg.not_connected())
        return
    balance = service.get_balance(db, user.id)
    await message.answer(
        f"💳 *Top Up Credits*\n\n"
        f"Current balance: *{balance:,}*\n\n"
        f"[Open billing page]({settings.BASE_URL}/account?tab=billing)",
    )


# ── /setdefault [modality] [model_id] — save preferred model ──────────────────

@router.message(Command("setdefault"))
async def cmd_setdefault(message: Message, db: Session):
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        await message.answer(msg.not_connected())
        return

    parts = (message.text or "").split(None, 3)
    if len(parts) < 3:
        await message.answer(
            "Usage: `/setdefault [modality] [model_id]`\n\n"
            "Example: `/setdefault text gpt-4o`\n"
            "Modalities: text, image, video, audio",
        )
        return

    modality, model_id = parts[1].lower(), parts[2].strip()
    if modality not in ("text", "image", "video", "audio"):
        await message.answer("Invalid modality\\. Choose: text, image, video, audio\\.")
        return

    service.set_preference(db, user.id, f"default_{modality}", model_id)
    await message.answer(msg.set_default_ok(modality, model_id))


# ── /broadcast [message] — admin only ────────────────────────────────────────

@router.message(Command("broadcast"))
async def cmd_broadcast(message: Message, db: Session):
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user or user.role not in ("admin", "superadmin"):
        await message.answer("⛔ Admin only\\.")
        return

    text = (message.text or "").split(None, 1)[1].strip() if " " in (message.text or "") else ""
    if not text:
        await message.answer("Usage: `/broadcast Your message here`")
        return

    connections = service.get_all_active_connections(db)
    sent, failed = 0, 0
    bot = message.bot
    for conn in connections:
        try:
            await bot.send_message(conn.chat_id, _esc(text))
            sent += 1
        except Exception:
            failed += 1

    await message.answer(
        f"📢 *Broadcast complete*\n\n"
        f"✅ Sent: *{sent}*\n"
        f"❌ Failed: *{failed}*"
    )


# ── Rating callbacks ──────────────────────────────────────────────────────────

@router.callback_query(lambda c: c.data.startswith("rate:"))
async def rating_callback(cb: CallbackQuery, db: Session):
    parts = cb.data.split(":")
    if len(parts) < 3:
        await cb.answer()
        return

    direction, request_id = parts[1], parts[2]
    rating = 5 if direction == "up" else 1

    user = service.get_user_by_chat_id(db, cb.message.chat.id)
    if user:
        try:
            from app.models.model_rating import ModelRating
            from app.models.request_record import RequestRecord
            record = db.query(RequestRecord).filter_by(
                id=request_id, user_id=user.id
            ).first()
            if record and record.model_id:
                existing = db.query(ModelRating).filter_by(
                    request_id=request_id, user_id=user.id
                ).first()
                if not existing:
                    db.add(ModelRating(
                        request_id=request_id,
                        user_id=user.id,
                        model_id=record.model_id,
                        rating=rating,
                    ))
                    db.commit()
        except Exception as e:
            logger.warning("Rating save error: %s", e)

    emoji = "👍" if direction == "up" else "👎"
    await cb.answer(f"{emoji} Rated!")
    try:
        await cb.message.edit_reply_markup(reply_markup=keyboards.retry_kb())
    except Exception:
        pass
