from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services.provider_keys import ProviderKeyService

router = APIRouter()

SUPPORTED_PROVIDERS = {"fal", "anthropic"}


class ProviderKeyRequest(BaseModel):
    provider: str
    api_key: str


@router.post("/auth/provider-keys")
def store_provider_key(
    body: ProviderKeyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.provider not in SUPPORTED_PROVIDERS:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail={
            "code": "UNSUPPORTED_PROVIDER",
            "message": f"Provider '{body.provider}' is not supported. Choose from: {sorted(SUPPORTED_PROVIDERS)}",
        })

    svc = ProviderKeyService(db)
    svc.upsert(user_id=current_user.id, provider=body.provider, api_key=body.api_key)

    return {"provider": body.provider, "stored": True}


@router.get("/auth/provider-keys")
def list_provider_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = ProviderKeyService(db)
    return {"providers": svc.list_providers(current_user.id)}
