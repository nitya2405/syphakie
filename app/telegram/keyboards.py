from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from app.models.model_registry import ModelRegistry


def modality_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="📝 Text",  callback_data="gen:mod:text"),
            InlineKeyboardButton(text="🖼 Image", callback_data="gen:mod:image"),
        ],
        [
            InlineKeyboardButton(text="🎬 Video", callback_data="gen:mod:video"),
            InlineKeyboardButton(text="🎵 Audio", callback_data="gen:mod:audio"),
        ],
        [InlineKeyboardButton(text="✕ Cancel", callback_data="gen:cancel")],
    ])


def model_kb(models: list[ModelRegistry]) -> InlineKeyboardMarkup:
    """Build a keyboard from a list of ModelRegistry rows. Index is the callback payload."""
    rows: list[list[InlineKeyboardButton]] = []
    for i in range(0, len(models), 2):
        row = []
        for j, m in enumerate(models[i : i + 2]):
            label = m.display_name[:24]
            row.append(InlineKeyboardButton(
                text=label,
                callback_data=f"gen:model:{i + j}",
            ))
        rows.append(row)
    rows.append([InlineKeyboardButton(text="✕ Cancel", callback_data="gen:cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def confirm_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✓ Generate", callback_data="gen:confirm"),
            InlineKeyboardButton(text="✕ Cancel",   callback_data="gen:cancel"),
        ],
    ])


def retry_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔄 Try again", callback_data="gen:start")],
    ])


def rate_kb(request_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="👍", callback_data=f"rate:up:{request_id}"),
        InlineKeyboardButton(text="👎", callback_data=f"rate:dn:{request_id}"),
        InlineKeyboardButton(text="🔄 Again", callback_data="gen:start"),
    ]])


def logout_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="Yes, disconnect", callback_data="logout:confirm"),
            InlineKeyboardButton(text="No, keep it",     callback_data="logout:cancel"),
        ],
    ])
