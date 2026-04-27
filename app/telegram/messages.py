import re
from app.config import settings

_ESCAPE_RE = re.compile(r'([_*\[\]()~`#+\-=|{}.!\\])')

def _esc(text: str) -> str:
    """Escape all MarkdownV2 special characters in user-supplied text."""
    return _ESCAPE_RE.sub(r'\\\1', str(text))


def _low_credits_warning(remaining: int) -> str:
    if remaining < 100:
        return f"\n\n⚠️ *Low balance:* {remaining:,} credits left\\. [Top up]({settings.BASE_URL}/account)"
    return ""


# ── Auth / connection ─────────────────────────────────────────────────────────

def welcome(email: str, org: str | None, balance: int) -> str:
    org_line = f"\n🏢 {_esc(org)}" if org else ""
    return (
        f"✅ *Connected to SyphaKie*\n\n"
        f"👤 {_esc(email)}{org_line}\n"
        f"💳 {balance:,} credits\n\n"
        f"*Commands:*\n"
        f"/generate — Run AI generation\n"
        f"/credits  — Check balance\n"
        f"/profile  — View account\n"
        f"/history  — Recent generations\n"
        f"/help     — All commands\n"
        f"/logout   — Disconnect"
    )


def not_connected() -> str:
    return (
        "⚠️ Your account isn't connected yet\\.\n\n"
        f"Open [Account → Profile]({settings.BASE_URL}/account) "
        "and click *Connect Telegram* to generate your link\\."
    )


def token_expired() -> str:
    return (
        "⏱ This link has expired \\(links are valid for 5 minutes\\)\\.\n\n"
        f"Generate a new one from [Account → Profile]({settings.BASE_URL}/account)\\."
    )


def already_connected(email: str) -> str:
    return f"✅ You're already connected as *{_esc(email)}*\\.\n\nUse /help to see available commands\\."


# ── Profile / credits ─────────────────────────────────────────────────────────

def profile(user, balance: int, org_name: str | None) -> str:
    org_line = f"\n🏢 *Org:* {_esc(org_name)}" if org_name else ""
    icon = "🛡" if user.role == "admin" else "👤"
    name = _esc(user.name) if user.name else "\\(no name\\)"
    return (
        f"{icon} *Your Profile*\n\n"
        f"📧 {_esc(user.email)}\n"
        f"🔤 {name}{org_line}\n"
        f"💳 {balance:,} credits\n"
        f"🏷 Role: `{user.role}`"
    )


def credits_info(balance: int) -> str:
    warn = _low_credits_warning(balance)
    return f"💳 *Credits*\n\nCurrent balance: *{balance:,}*{warn}"


# ── History ───────────────────────────────────────────────────────────────────

def _history_entry(rec, i: int) -> str:
    icons = {"success": "✅", "failed": "❌", "pending": "⏳"}
    status_icon = icons.get(rec.status, "•")
    model_part = f" · `{rec.model_id}`" if rec.model_id else ""
    prompt_part = ""
    if rec.input_payload and rec.input_payload.get("prompt"):
        p = rec.input_payload["prompt"]
        prompt_part = f"\n_{_esc(p[:60])}{'…' if len(p) > 60 else ''}_"
    url_part = f"\n[View output]({rec.output_url})" if rec.output_url else ""
    return f"{i}\\. {status_icon} *{rec.modality or '?'}*{model_part}{prompt_part}{url_part}"


def history_list(records) -> str:
    if not records:
        return "📋 *Recent Generations*\n\nNo generations yet\\. Use /generate to start\\."
    entries = "\n\n".join(_history_entry(r, i + 1) for i, r in enumerate(records))
    return f"📋 *Recent Generations*\n\n{entries}"


# ── Generate flow ─────────────────────────────────────────────────────────────

def confirm_summary(modality: str, model_id: str, provider: str, prompt: str) -> str:
    icons = {"text": "📝", "image": "🖼", "video": "🎬", "audio": "🎵"}
    icon = icons.get(modality, "⚡")
    prompt_display = _esc(prompt[:300]) + ("…" if len(prompt) > 300 else "")
    return (
        f"{icon} *Confirm Generation*\n\n"
        f"*Modality:* {modality.capitalize()}\n"
        f"*Model:* `{model_id}`\n"
        f"*Provider:* {_esc(provider)}\n\n"
        f"*Prompt:*\n{prompt_display}"
    )


# ── Notification messages (called by notifier) ────────────────────────────────

def generation_started(payload: dict) -> str:
    modality = payload.get("modality", "")
    model = payload.get("model", "")
    icons = {"text": "📝", "image": "🖼", "video": "🎬", "audio": "🎵"}
    icon = icons.get(modality, "⚡")
    return f"{icon} *Generating…*\nModel: `{model}`"


def generation_complete(payload: dict) -> str:
    modality = payload.get("modality", "text")
    model = payload.get("model", "")
    credits_used = payload.get("credits_used", 0)
    remaining = payload.get("credits_remaining", 0)
    prompt = payload.get("prompt", "")
    content = payload.get("output_content") or ""
    url = payload.get("output_url") or ""

    icons = {"text": "📝", "image": "🖼", "video": "🎬", "audio": "🎵"}
    icon = icons.get(modality, "⚡")

    parts = [f"{icon} *Generation complete*"]
    if prompt:
        p = _esc(prompt[:80]) + ("…" if len(prompt) > 80 else "")
        parts.append(f"_{p}_")
    parts.append(f"*Model:* `{model}`  •  *Used:* {credits_used} cr")

    if content and modality == "text":
        truncated = _esc(content[:3500])
        if len(content) > 3500:
            truncated += "\n…\\(truncated\\)"
        parts.append(f"\n{truncated}")
    elif url and modality not in ("image", "video", "audio"):
        parts.append(f"[View output]({url})")

    parts.append(_low_credits_warning(remaining))
    return "\n".join(parts)


def generation_failed(payload: dict) -> str:
    error = payload.get("error", "Unknown error")
    return f"❌ *Generation failed*\n\n`{error[:200]}`\n\nUse the button below to retry\\."


def usage_stats(stats: dict) -> str:
    icons = {"text": "📝", "image": "🖼", "video": "🎬", "audio": "🎵"}
    by_mod = stats.get("by_modality", {})
    mod_lines = "\n".join(
        f"  {icons.get(k, '⚡')} {k}: *{v}*"
        for k, v in by_mod.items()
    ) or "  None yet"
    return (
        f"📊 *Usage Stats*\n\n"
        f"*Today*\n"
        f"  Requests: *{stats['today_requests']}*\n"
        f"  Credits: *{stats['today_credits']:,}*\n\n"
        f"*This month*\n"
        f"  Requests: *{stats['month_requests']}*\n"
        f"  Credits: *{stats['month_credits']:,}*\n\n"
        f"*All time*\n"
        f"  Requests: *{stats['total_requests']}*\n"
        f"  Credits: *{stats['total_credits']:,}*\n\n"
        f"*By modality*\n{mod_lines}"
    )


def set_default_ok(modality: str, model_id: str) -> str:
    return (
        f"✅ Default *{modality}* model set to `{_esc(model_id)}`\\.\n\n"
        f"Quick commands \\(/q, /img\\) will now use this model\\."
    )


def credits_low(payload: dict) -> str:
    balance = payload.get("balance", 0)
    return (
        f"⚠️ *Low credits warning*\n\n"
        f"You have *{balance:,}* credits remaining\\.\n"
        f"[Top up now]({settings.BASE_URL}/account)"
    )
