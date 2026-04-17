from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.user_provider_key import UserProviderKey


class ProviderKeyService:
    def __init__(self, db: Session):
        self.db = db

    def upsert(self, user_id, provider: str, api_key: str) -> None:
        existing = self.db.query(UserProviderKey).filter_by(
            user_id=user_id, provider=provider
        ).first()

        if existing:
            existing.api_key = api_key
            existing.is_active = True
        else:
            self.db.add(UserProviderKey(
                user_id=user_id,
                provider=provider,
                api_key=api_key,
            ))
        self.db.commit()

    def get_key(self, user_id, provider: str) -> str:
        record = self.db.query(UserProviderKey).filter_by(
            user_id=user_id, provider=provider, is_active=True
        ).first()

        if not record:
            raise HTTPException(status_code=400, detail={
                "code": "MISSING_PROVIDER_KEY",
                "message": f"No active key stored for provider '{provider}'. "
                           f"Use POST /api/v1/auth/provider-keys to add one.",
            })
        return record.api_key

    def list_providers(self, user_id) -> list[str]:
        rows = self.db.query(UserProviderKey.provider).filter_by(
            user_id=user_id, is_active=True
        ).all()
        return [r.provider for r in rows]
