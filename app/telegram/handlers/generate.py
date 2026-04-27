import asyncio
import logging
import uuid as _uuid
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

# Modalities that use async job (takes > 30 s)
_ASYNC_MODALITIES = {"video", "audio"}


# ── /generate entry ───────────────────────────────────────────────────────────

@router.message(Command("generate"))
async def cmd_generate(message: Message, state: FSMContext, db: Session):
    user = service.get_user_by_chat_id(db, message.chat.id)
    if not user:
        await message.answer(msg.not_connected())
        return

    # Block double-submission for slow async jobs
    tg_state = service.get_state(db, user.id)
    if tg_state and tg_state.state == "awaiting_async_job":
        await message.answer(
            "⏳ You already have a generation in progress\\.\n"
            "I'll notify you when it's done\\.\n\n"
            "Use /cancel to abort\\."
        )
        return

    await state.clear()
    await state.set_state(Gen.modality)
    await message.answer("Choose modality:", reply_markup=keyboards.modality_kb())


# ── Step 1: pick modality ─────────────────────────────────────────────────────

@router.callback_query(lambda c: c.data.startswith("gen:mod:"), Gen.modality)
async def pick_modality(cb: CallbackQuery, state: FSMContext, db: Session):
    modality = cb.data.split(":")[2]
    models = service.get_top_models(db, modality)

    if not models:
        await cb.message.edit_text(f"No active {modality} models available\\. Try another modality\\.")
        await state.clear()
        await cb.answer()
        return

    # Serialise just what we need; avoids storing SQLAlchemy objects in FSM
    model_list = [
        {"id": m.model_id, "provider": m.provider, "name": m.display_name}
        for m in models
    ]
    await state.update_data(modality=modality, models=model_list)
    await state.set_state(Gen.model)
    try:
        await cb.message.edit_text(
            f"Choose a *{modality}* model:",
            reply_markup=keyboards.model_kb(models),
        )
    except Exception as e:
        logger.warning("edit_text failed in pick_modality: %s", e)
    await cb.answer()


# ── Step 2: pick model ────────────────────────────────────────────────────────

@router.callback_query(lambda c: c.data.startswith("gen:model:"), Gen.model)
async def pick_model(cb: CallbackQuery, state: FSMContext):
    try:
        idx = int(cb.data.split(":")[2])
    except (IndexError, ValueError):
        await cb.answer("Invalid selection.", show_alert=True)
        return

    data = await state.get_data()
    models: list[dict] = data.get("models", [])
    if idx >= len(models):
        await cb.answer("Model index out of range.", show_alert=True)
        return

    model = models[idx]
    await state.update_data(model_id=model["id"], provider=model["provider"], model_name=model["name"])
    await state.set_state(Gen.prompt)
    try:
        await cb.message.edit_text(
            f"*{_esc(model['name'])}* selected\\.\n\nEnter your prompt:"
        )
    except Exception as e:
        logger.warning("edit_text failed in pick_model: %s", e)
    await cb.answer()


# ── Step 3: receive prompt ────────────────────────────────────────────────────

@router.message(Gen.prompt)
async def enter_prompt(message: Message, state: FSMContext):
    prompt = (message.text or "").strip()
    if len(prompt) < 3:
        await message.answer("Prompt is too short\\. Please be more descriptive\\.")
        return

    data = await state.get_data()
    await state.update_data(prompt=prompt)
    await state.set_state(Gen.confirm)

    await message.answer(
        msg.confirm_summary(data["modality"], data["model_id"], data["provider"], prompt),
        reply_markup=keyboards.confirm_kb(),
    )


# ── Step 4: confirm → generate ────────────────────────────────────────────────

@router.callback_query(lambda c: c.data == "gen:confirm", Gen.confirm)
async def do_confirm(cb: CallbackQuery, state: FSMContext, db: Session):
    data = await state.get_data()
    await state.clear()

    user = service.get_user_by_chat_id(db, cb.message.chat.id)
    if not user:
        await cb.message.edit_text(msg.not_connected())
        await cb.answer()
        return

    modality: str  = data["modality"]
    model_id: str | None = data.get("model_id")
    provider: str | None = data.get("provider")
    prompt: str    = data["prompt"]
    image_url: str | None = data.get("image_url")

    from app.schemas.generate import GenerateRequest

    request = GenerateRequest(
        modality=modality,
        mode="manual" if model_id else "auto",
        prompt=prompt,
        model=model_id,
        provider=provider,
        image_url=image_url,
        async_job=False,
    )

    if modality in _ASYNC_MODALITIES:
        await _run_async(cb, db, user, request, modality, model_id, prompt)
    else:
        await _run_sync(cb, db, user, request, modality, prompt)

    await cb.answer()


# ── Async path (video / audio) ────────────────────────────────────────────────

async def _run_async(cb: CallbackQuery, db: Session, user, request, modality: str, model_id: str, prompt: str):
    from app.models.job import Job
    from app.api.generate import _run_job

    job = Job(
        id=_uuid.uuid4(),
        user_id=user.id,
        status="queued",
        modality=modality,
        input_payload=request.model_dump(exclude={"async_job"}),
    )
    db.add(job)
    db.commit()

    service.set_state(db, user.id, cb.message.chat.id, "awaiting_async_job", {
        "job_id": str(job.id),
        "modality": modality,
        "model_id": model_id,
        "prompt": prompt[:80],
    })

    asyncio.create_task(_run_job(str(job.id), str(user.id), request))

    await cb.message.edit_text(
        f"⏳ *{modality.capitalize()} generation queued*\n\n"
        f"Model: `{model_id}`\n\n"
        f"I'll send the result when it's ready \\(usually 1–3 min\\)\\.",
    )


# ── Sync path (text / image) ──────────────────────────────────────────────────

async def _run_sync(cb: CallbackQuery, db: Session, user, request, modality: str, prompt: str):
    from app.services.generate import GenerationService
    from fastapi import HTTPException

    await cb.message.edit_text("⏳ Generating…")

    try:
        result = await GenerationService(db).run(user=user, request=request)
    except HTTPException as e:
        detail = e.detail if isinstance(e.detail, dict) else {}
        if e.status_code == 402 or detail.get("code") == "INSUFFICIENT_CREDITS":
            balance = service.get_balance(db, user.id)
            from app.config import settings
            await cb.message.edit_text(
                f"❌ *Insufficient credits*\n\n"
                f"Balance: *{balance:,}*\n\n"
                f"[Top up]({settings.BASE_URL}/account)",
            )
        else:
            await cb.message.edit_text(
                msg.generation_failed({"error": detail.get("message", str(e))}),
                reply_markup=keyboards.retry_kb(),
            )
        logger.warning("Generation HTTPException for user %s: %s", user.id, e)
        return
    except Exception as e:
        await cb.message.edit_text(
            msg.generation_failed({"error": str(e)}),
            reply_markup=keyboards.retry_kb(),
        )
        logger.error("Generation error for user %s: %s", user.id, e, exc_info=True)
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
            await cb.message.answer_photo(url, caption=text[:1024], reply_markup=kb)
            await cb.message.delete()
        elif url and modality in ("video", "audio"):
            await cb.message.edit_text(text + f"\n[Open]({url})", reply_markup=kb)
        else:
            await cb.message.edit_text(text, reply_markup=kb)
    except Exception as send_err:
        logger.warning("Failed to send result message: %s", send_err)
        await cb.message.edit_text(
            text + (f"\n\n[View output]({url})" if url else ""),
            reply_markup=kb,
        )


# ── Cancel / retry callbacks ──────────────────────────────────────────────────

@router.callback_query(lambda c: c.data == "gen:cancel")
async def cancel_cb(cb: CallbackQuery, state: FSMContext, db: Session):
    await state.clear()
    user = service.get_user_by_chat_id(db, cb.message.chat.id)
    if user:
        service.clear_state(db, user.id)
    await cb.message.edit_text("✕ Cancelled\\.")
    await cb.answer()


@router.callback_query(lambda c: c.data == "gen:start")
async def retry_cb(cb: CallbackQuery, state: FSMContext):
    await state.set_state(Gen.modality)
    await cb.message.edit_text("Choose modality:", reply_markup=keyboards.modality_kb())
    await cb.answer()
