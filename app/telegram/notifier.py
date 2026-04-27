"""
Internal Telegram notification dispatcher.

Called directly from GenerationService.run() and _run_job — NOT through
the HTTP webhook loop. This keeps notifications in-process and zero-latency.
"""
import logging
from sqlalchemy.orm import Session
from app.models.telegram_connection import TelegramConnection
from app.telegram import messages as msg

logger = logging.getLogger(__name__)


async def dispatch_telegram(db: Session, user_id: str, event: str, payload: dict) -> None:
    from app.telegram import get_bot

    bot = get_bot()
    if bot is None:
        return

    conn = db.query(TelegramConnection).filter_by(
        user_id=user_id, is_active=True
    ).first()
    if not conn:
        return

    chat_id = conn.chat_id

    try:
        if event == "generation.started":
            await bot.send_message(chat_id, msg.generation_started(payload))

        elif event == "generation.complete":
            text = msg.generation_complete(payload)
            modality = payload.get("modality", "text")
            url = payload.get("output_url") or ""

            sent = False
            if url:
                try:
                    if modality == "image":
                        await bot.send_photo(chat_id, url, caption=text[:1024])
                        sent = True
                    elif modality == "video":
                        await bot.send_video(chat_id, url, caption=text[:1024])
                        sent = True
                    elif modality == "audio":
                        await bot.send_audio(chat_id, url, caption=text[:1024])
                        sent = True
                except Exception as media_err:
                    logger.warning("Media send failed (%s), falling back to URL link: %s", modality, media_err)

            if not sent:
                # Text output or media fallback — append URL as link
                if url and modality in ("image", "video", "audio"):
                    text += f"\n\n[Open {modality}]({url})"
                await bot.send_message(chat_id, text)

            # Clear any async job state
            from app.telegram.service import clear_state
            clear_state(db, user_id)

        elif event == "generation.failed":
            from app.telegram.keyboards import retry_kb
            await bot.send_message(
                chat_id,
                msg.generation_failed(payload),
                reply_markup=retry_kb(),
            )
            from app.telegram.service import clear_state
            clear_state(db, user_id)

        elif event == "credits.low":
            await bot.send_message(chat_id, msg.credits_low(payload))

    except Exception as e:
        err_str = str(e).lower()
        if "forbidden" in err_str or "bot was blocked" in err_str:
            # User blocked the bot — silently deactivate
            conn.is_active = False
            db.commit()
            logger.info("Deactivated Telegram connection for user %s (bot blocked)", user_id)
        else:
            logger.error("Telegram dispatch error for user %s event=%s: %s", user_id, event, e)
