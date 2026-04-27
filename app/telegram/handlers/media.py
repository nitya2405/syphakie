"""Voice and photo message handlers.

Voice in Gen.prompt state  → transcribe → use as prompt
Photo in Gen.prompt state  → use as image_url for img2img
Voice outside state        → transcribe and show text
Photo outside state        → offer to generate a variation
"""
import logging
from aiogram import Router, F
from aiogram.types import Message
from aiogram.fsm.context import FSMContext
from sqlalchemy.orm import Session
from app.telegram import service, keyboards
from app.telegram import messages as msg
from app.telegram.messages import _esc
from app.telegram.states import Gen

router = Router()
logger = logging.getLogger(__name__)


async def _get_telegram_file_url(message: Message, file_id: str) -> str:
    bot = message.bot
    file = await bot.get_file(file_id)
    token = bot.token
    return f"https://api.telegram.org/file/bot{token}/{file.file_path}"


async def _transcribe(message: Message, db: Session, file_url: str) -> str | None:
    """Run STT via GenerationService. Returns transcript text or None on failure."""
    from app.services.generate import GenerationService
    from app.schemas.generate import GenerateRequest

    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        return None

    request = GenerateRequest(
        modality="audio",
        task_type="speech_to_text",
        mode="auto",
        prompt="",
        file_url=file_url,
    )
    try:
        result = await GenerationService(db).run(user=user, request=request)
        return result.output.content
    except Exception as e:
        logger.warning("STT error: %s", e)
        return None


# ── Voice messages ────────────────────────────────────────────────────────────

@router.message(F.voice, Gen.prompt)
async def voice_in_prompt(message: Message, state: FSMContext, db: Session):
    """Voice message while bot is waiting for a prompt — transcribe and use."""
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        return

    thinking = await message.answer("🎤 Transcribing voice…")

    try:
        file_url = await _get_telegram_file_url(message, message.voice.file_id)
        transcript = await _transcribe(message, db, file_url)
    except Exception as e:
        logger.warning("Voice transcription error: %s", e)
        transcript = None

    if not transcript:
        await thinking.edit_text("❌ Could not transcribe audio\\. Please type your prompt instead\\.")
        return

    escaped = _esc(transcript)
    await thinking.edit_text(f"🎤 *Transcribed:*\n_{escaped}_\n\nGenerating…")

    data = await state.get_data()
    modality: str = data.get("modality", "text")
    model_id: str | None = data.get("model_id")
    provider: str | None = data.get("provider")

    from app.services.generate import GenerationService
    from app.schemas.generate import GenerateRequest
    from fastapi import HTTPException

    request = GenerateRequest(
        modality=modality,
        mode="manual" if model_id else "auto",
        prompt=transcript,
        model=model_id,
        provider=provider,
    )

    await state.clear()

    try:
        result = await GenerationService(db).run(user=user, request=request)
    except HTTPException as e:
        detail = e.detail if isinstance(e.detail, dict) else {}
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
        return

    payload = {
        "modality": modality,
        "model": result.model,
        "prompt": transcript,
        "credits_used": result.meta.credits_used,
        "credits_remaining": result.meta.credits_remaining,
        "output_content": result.output.content,
        "output_url": result.output.url,
    }
    text = msg.generation_complete(payload)
    kb = keyboards.rate_kb(result.request_id)

    try:
        if result.output.url and modality == "image":
            await thinking.delete()
            await message.answer_photo(result.output.url, caption=text[:1024], reply_markup=kb)
        else:
            await thinking.edit_text(text, reply_markup=kb)
    except Exception as e:
        logger.warning("Voice result send error: %s", e)
        await thinking.edit_text(text, reply_markup=kb)


@router.message(F.voice)
async def voice_outside_state(message: Message, db: Session):
    """Voice message outside any flow — transcribe and show."""
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        await message.answer(msg.not_connected())
        return

    thinking = await message.answer("🎤 Transcribing…")

    try:
        file_url = await _get_telegram_file_url(message, message.voice.file_id)
        transcript = await _transcribe(message, db, file_url)
    except Exception as e:
        logger.warning("Voice transcription error: %s", e)
        transcript = None

    if not transcript:
        await thinking.edit_text("❌ Could not transcribe audio\\.")
        return

    escaped = _esc(transcript)
    await thinking.edit_text(
        f"🎤 *Transcript:*\n\n{escaped}",
        reply_markup=keyboards.retry_kb(),
    )


# ── Photo messages ────────────────────────────────────────────────────────────

@router.message(F.photo, Gen.prompt)
async def photo_in_prompt(message: Message, state: FSMContext, db: Session):
    """Photo sent while bot awaits prompt — use as image_url, caption as prompt."""
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        return

    caption = (message.caption or "").strip()
    if not caption:
        await message.answer(
            "📸 Image received\\. Add a caption describing what to do with it\\.\n"
            "Example: _'Make it look like a painting'_"
        )
        return

    thinking = await message.answer("🖼 Preparing image…")

    try:
        # Use highest-resolution photo
        photo = message.photo[-1]
        image_url = await _get_telegram_file_url(message, photo.file_id)
    except Exception as e:
        logger.warning("Photo URL error: %s", e)
        await thinking.edit_text("❌ Could not retrieve image\\. Please try again\\.")
        return

    data = await state.get_data()
    model_id: str | None = data.get("model_id")
    provider: str | None = data.get("provider")

    from app.services.generate import GenerationService
    from app.schemas.generate import GenerateRequest
    from fastapi import HTTPException

    request = GenerateRequest(
        modality="image",
        mode="manual" if model_id else "auto",
        prompt=caption,
        model=model_id,
        provider=provider,
        image_url=image_url,
    )

    await state.clear()
    await thinking.edit_text("⏳ Generating image variation…")

    try:
        result = await GenerationService(db).run(user=user, request=request)
    except HTTPException as e:
        detail = e.detail if isinstance(e.detail, dict) else {}
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
        return

    payload = {
        "modality": "image",
        "model": result.model,
        "prompt": caption,
        "credits_used": result.meta.credits_used,
        "credits_remaining": result.meta.credits_remaining,
        "output_content": result.output.content,
        "output_url": result.output.url,
    }
    text = msg.generation_complete(payload)
    kb = keyboards.rate_kb(result.request_id)

    try:
        if result.output.url:
            await thinking.delete()
            await message.answer_photo(result.output.url, caption=text[:1024], reply_markup=kb)
        else:
            await thinking.edit_text(text, reply_markup=kb)
    except Exception as e:
        logger.warning("Photo result send error: %s", e)
        await thinking.edit_text(text, reply_markup=kb)


@router.message(F.photo)
async def photo_outside_state(message: Message, state: FSMContext, db: Session):
    """Photo outside flow — start img2img flow."""
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        await message.answer(msg.not_connected())
        return

    try:
        photo = message.photo[-1]
        image_url = await _get_telegram_file_url(message, photo.file_id)
    except Exception:
        return

    await state.update_data(modality="image", model_id=None, provider=None, model_name="Auto", image_url=image_url)
    await state.set_state(Gen.prompt)
    await message.answer(
        "📸 Got your image\\!\n\nAdd a caption or send a prompt describing what to generate from it:",
    )
