import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.deps import get_current_user, get_db
from app.api import generate, outputs, credits, models, usage, auth, admin
from app.api import billing, notifications, orgs, proxy, templates
from app.api import webhooks, leaderboard, pipelines, cache, jobs
from app.middleware.rate_limit import RateLimitMiddleware
from app.models.user import User


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    if settings.TELEGRAM_BOT_TOKEN:
        from app.telegram import start_bot
        asyncio.create_task(start_bot(
            token=settings.TELEGRAM_BOT_TOKEN,
            webhook_url=settings.TELEGRAM_WEBHOOK_URL,
            webhook_secret=settings.TELEGRAM_WEBHOOK_SECRET,
        ))

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    if settings.TELEGRAM_BOT_TOKEN:
        from app.telegram import stop_bot
        await stop_bot()


def create_app() -> FastAPI:
    app = FastAPI(
        title="SyphaKie",
        version="0.1.0",
        docs_url="/docs",
        redoc_url=None,
        lifespan=lifespan,
    )

    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
    app.mount("/files", StaticFiles(directory=settings.OUTPUT_DIR), name="files")

    @app.get("/health")
    def health():
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/api/v1/me")
    def me(current_user: User = Depends(get_current_user), db=Depends(get_db)):
        from app.models.api_key import ApiKey
        key_record = db.query(ApiKey).filter_by(
            user_id=current_user.id, is_active=True
        ).order_by(ApiKey.created_at.desc()).first()
        return {
            "id": str(current_user.id),
            "email": current_user.email,
            "name": current_user.name,
            "phone_number": current_user.phone_number,
            "role": current_user.role,
            "api_key": key_record.key_value if key_record else None,
            "api_key_prefix": key_record.key_prefix if key_record else None,
        }

    app.include_router(generate.router,       prefix="/api/v1",  tags=["Generate"])
    app.include_router(outputs.router,        prefix="/api/v1",  tags=["Outputs"])
    app.include_router(credits.router,        prefix="/api/v1",  tags=["Credits"])
    app.include_router(models.router,         prefix="/api/v1",  tags=["Models"])
    app.include_router(usage.router,          prefix="/api/v1",  tags=["Usage"])
    app.include_router(auth.router,           prefix="/api/v1",  tags=["Auth"])
    app.include_router(admin.router,          prefix="/api/v1",  tags=["Admin"])
    app.include_router(billing.router,        prefix="/api/v1",  tags=["Billing"])
    app.include_router(notifications.router,  prefix="/api/v1",  tags=["Notifications"])
    app.include_router(orgs.router,           prefix="/api/v1",  tags=["Orgs"])
    app.include_router(templates.router,      prefix="/api/v1",  tags=["Templates"])
    app.include_router(webhooks.router,       prefix="/api/v1",  tags=["Webhooks"])
    app.include_router(leaderboard.router,    prefix="/api/v1",  tags=["Leaderboard"])
    app.include_router(pipelines.router,      prefix="/api/v1",  tags=["Pipelines"])
    app.include_router(cache.router,          prefix="/api/v1",  tags=["Cache"])
    app.include_router(jobs.router,           prefix="/api/v1",  tags=["Jobs"])
    app.include_router(proxy.router,          prefix="/api",      tags=["Proxy"])

    # Telegram — auth-protected endpoints + webhook receiver (separate routers)
    from app.telegram.router import router as telegram_router, webhook_router as tg_webhook_router
    app.include_router(telegram_router,         prefix="/api/v1", tags=["Telegram"])
    app.include_router(tg_webhook_router,       prefix="",        include_in_schema=False)

    return app


app = create_app()
