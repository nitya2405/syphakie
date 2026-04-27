import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage

logger = logging.getLogger(__name__)

_bot: Bot | None = None
_dp: Dispatcher | None = None


def get_bot() -> Bot | None:
    return _bot


def get_dp() -> Dispatcher | None:
    return _dp


async def start_bot(token: str, webhook_url: str = "", webhook_secret: str = "") -> None:
    global _bot, _dp

    _bot = Bot(
        token=token,
        default=DefaultBotProperties(parse_mode=ParseMode.MARKDOWN_V2),
    )
    _dp = Dispatcher(storage=MemoryStorage())

    # Inject DB session into every update type
    from app.telegram.middleware import DbSessionMiddleware
    mw = DbSessionMiddleware()
    _dp.message.middleware(mw)
    _dp.callback_query.middleware(mw)
    _dp.inline_query.middleware(mw)

    # Register handler routers (order matters: specific before catch-all)
    from app.telegram.handlers import auth, profile, history, misc, generate as gen_h
    from app.telegram.handlers import quick, media, inline as inline_h
    _dp.include_router(auth.router)
    _dp.include_router(gen_h.router)
    _dp.include_router(quick.router)
    _dp.include_router(media.router)
    _dp.include_router(profile.router)
    _dp.include_router(history.router)
    _dp.include_router(misc.router)
    _dp.include_router(inline_h.router)

    from aiogram.types import BotCommand
    await _bot.set_my_commands([
        BotCommand(command="q",           description="Quick text generation"),
        BotCommand(command="img",         description="Quick image generation"),
        BotCommand(command="generate",    description="Full generation flow"),
        BotCommand(command="credits",     description="Check balance"),
        BotCommand(command="usage",       description="Generation stats"),
        BotCommand(command="topup",       description="Add more credits"),
        BotCommand(command="profile",     description="View account"),
        BotCommand(command="history",     description="Recent generations"),
        BotCommand(command="setdefault",  description="Set default model per modality"),
        BotCommand(command="cancel",      description="Cancel current action"),
        BotCommand(command="logout",      description="Disconnect Telegram"),
        BotCommand(command="help",        description="All commands"),
    ])

    if webhook_url:
        await _bot.set_webhook(
            url=webhook_url,
            secret_token=webhook_secret or None,
            drop_pending_updates=True,
        )
        logger.info("Telegram bot running in webhook mode: %s", webhook_url)
        # Webhook updates are fed by the FastAPI router — no polling loop here
    else:
        # Clear any previously registered webhook so polling receives updates
        await _bot.delete_webhook(drop_pending_updates=True)
        logger.info("Telegram bot starting long-polling")
        asyncio.create_task(_dp.start_polling(_bot, skip_updates=False))


async def stop_bot() -> None:
    global _bot, _dp
    if _bot:
        try:
            if _dp:
                await _dp.storage.close()
            await _bot.session.close()
        except Exception:
            pass
        _bot = None
        _dp = None
    logger.info("Telegram bot stopped")
