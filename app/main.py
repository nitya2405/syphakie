from fastapi import FastAPI, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.deps import get_current_user, get_db
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

    app.include_router(generate.router, prefix="/api/v1", tags=["Generate"])
    app.include_router(outputs.router,  prefix="/api/v1", tags=["Outputs"])
    app.include_router(credits.router,  prefix="/api/v1", tags=["Credits"])
    app.include_router(models.router,   prefix="/api/v1", tags=["Models"])
    app.include_router(usage.router,    prefix="/api/v1", tags=["Usage"])
    app.include_router(auth.router,     prefix="/api/v1", tags=["Auth"])
    app.include_router(admin.router,    prefix="/api/v1", tags=["Admin"])

    return app


app = create_app()
