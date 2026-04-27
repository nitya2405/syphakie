"""Inline mode: @SyphaKieBot [prompt] in any chat."""
import logging
from aiogram import Router
from aiogram.types import InlineQuery, InlineQueryResultArticle, InputTextMessageContent
from sqlalchemy.orm import Session
from app.telegram import service

router = Router()
logger = logging.getLogger(__name__)


@router.inline_query()
async def inline_handler(query: InlineQuery, db: Session):
    prompt = query.query.strip()
    bot_username = (await query.bot.get_me()).username

    if not prompt:
        await query.answer(
            results=[],
            switch_pm_text="Type a prompt to generate",
            switch_pm_parameter="inline",
            cache_time=5,
        )
        return

    user = service.get_user_by_chat_id(db, query.from_user.id)

    if not user:
        await query.answer(
            results=[],
            switch_pm_text="Connect your account first",
            switch_pm_parameter="inline",
            cache_time=30,
        )
        return

    short = prompt[:50] + ("…" if len(prompt) > 50 else "")
    balance = service.get_balance(db, user.id)

    results = [
        InlineQueryResultArticle(
            id="text",
            title=f"📝 Generate text",
            description=short,
            input_message_content=InputTextMessageContent(
                message_text=f"📝 Generating: _{prompt[:200]}_\n\n_Open @{bot_username} to see the result_",
                parse_mode="MarkdownV2",
            ),
            thumb_url=None,
        ),
        InlineQueryResultArticle(
            id="image",
            title=f"🖼 Generate image",
            description=short,
            input_message_content=InputTextMessageContent(
                message_text=f"🖼 Generating image: _{prompt[:200]}_\n\n_Open @{bot_username} to see the result_",
                parse_mode="MarkdownV2",
            ),
        ),
        InlineQueryResultArticle(
            id="balance",
            title=f"💳 Balance: {balance:,} credits",
            description="Your current credit balance",
            input_message_content=InputTextMessageContent(
                message_text=f"💳 SyphaKie balance: *{balance:,}* credits",
                parse_mode="MarkdownV2",
            ),
        ),
    ]

    await query.answer(
        results=results,
        switch_pm_text=f"Generate in bot: {short}",
        switch_pm_parameter="inline",
        cache_time=10,
    )
