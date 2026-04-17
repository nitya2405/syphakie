from fastapi import FastAPI, Depends
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.api.deps import get_current_user
from app.api import generate, outputs, credits, models, usage, auth, admin
from app.models.user import User
import os


def create_app() -> FastAPI:
    app = FastAPI(
        title="SyphaKie",
        version="0.1.0",
        docs_url="/docs",
        redoc_url=None,
    )

    os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
    app.mount("/files", StaticFiles(directory=settings.OUTPUT_DIR), name="files")

    @app.get("/health")
    def health():
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/api/v1/me")
    def me(current_user: User = Depends(get_current_user)):
        return {
            "id": str(current_user.id),
            "email": current_user.email,
            "role": current_user.role,
        }

    app.include_router(generate.router, prefix="/api/v1", tags=["Generate"])
    app.include_router(outputs.router,  prefix="/api/v1", tags=["Outputs"])
    app.include_router(credits.router,  prefix="/api/v1", tags=["Credits"])
    app.include_router(models.router,   prefix="/api/v1", tags=["Models"])
    app.include_router(usage.router,    prefix="/api/v1", tags=["Usage"])
    app.include_router(auth.router,     prefix="/api/v1", tags=["Auth"])
    app.include_router(admin.router,    prefix="/api/v1", tags=["Admin"])

    return app


app = create_app()
