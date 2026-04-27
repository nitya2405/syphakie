import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.api_key import ApiKey
from app.models.credit import Credit
from app.config import settings

router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _generate_api_key() -> str:
    return "sk-" + secrets.token_urlsafe(32)


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Signup ───────────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: str | None = None


class SignupResponse(BaseModel):
    api_key: str      # raw key — shown once, also retrievable from /me
    user_id: str
    email: str


@router.post("/auth/signup", response_model=SignupResponse)
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail={
            "code": "WEAK_PASSWORD",
            "message": "Password must be at least 8 characters.",
        })

    existing = db.query(User).filter_by(email=body.email.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail={
            "code": "EMAIL_TAKEN",
            "message": "An account with this email already exists.",
        })

    user = User(
        email=body.email.lower(),
        name=body.full_name,
        password_hash=pwd_context.hash(body.password),
    )
    db.add(user)
    db.flush()  # get user.id before committing

    raw_key = _generate_api_key()
    db.add(ApiKey(
        user_id=user.id,
        key_hash=_hash_key(raw_key),
        key_prefix=raw_key[:8],
        key_value=raw_key,
        label="default",
    ))
    db.add(Credit(user_id=user.id, balance=settings.DEFAULT_CREDITS))
    db.commit()

    return SignupResponse(api_key=raw_key, user_id=str(user.id), email=user.email)


# ── Login ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    api_key: str
    user_id: str
    email: str
    name: str | None


@router.post("/auth/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email.lower(), is_active=True).first()

    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail={
            "code": "INVALID_CREDENTIALS",
            "message": "Incorrect email or password.",
        })

    if not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail={
            "code": "INVALID_CREDENTIALS",
            "message": "Incorrect email or password.",
        })

    api_key_record = db.query(ApiKey).filter_by(
        user_id=user.id, is_active=True
    ).order_by(ApiKey.created_at.desc()).first()

    if not api_key_record:
        raise HTTPException(status_code=500, detail={
            "code": "NO_API_KEY",
            "message": "No active API key found for this account.",
        })

    return LoginResponse(
        api_key=api_key_record.key_value or api_key_record.key_prefix + "...",
        user_id=str(user.id),
        email=user.email,
        name=user.name,
    )


# ── Profile ──────────────────────────────────────────────────────────────────

class UpdateProfileRequest(BaseModel):
    name: str | None = None
    phone_number: str | None = None


@router.patch("/me")
def update_profile(
    body: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.name is not None:
        current_user.name = body.name
    if body.phone_number is not None:
        current_user.phone_number = body.phone_number
    db.commit()
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "name": current_user.name,
        "phone_number": current_user.phone_number,
        "role": current_user.role,
    }


# ── API Key Management ────────────────────────────────────────────────────────

class CreateKeyRequest(BaseModel):
    name: str = "My Key"
    scope: str | None = None        # null = all modalities
    expires_days: int | None = None  # null = never


@router.post("/auth/keys")
def create_api_key(
    body: CreateKeyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    raw_key = _generate_api_key()
    expires_at = None
    if body.expires_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_days)

    key = ApiKey(
        user_id=current_user.id,
        key_hash=_hash_key(raw_key),
        key_prefix=raw_key[:8],
        key_value=raw_key,
        name=body.name,
        scope=body.scope,
        expires_at=expires_at,
    )
    db.add(key)
    db.commit()
    return {
        "key": raw_key,
        "id": str(key.id),
        "name": key.name,
        "prefix": key.key_prefix,
        "scope": key.scope,
        "expires_at": key.expires_at.isoformat() if key.expires_at else None,
    }


@router.get("/auth/keys")
def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    keys = db.query(ApiKey).filter_by(user_id=current_user.id, is_active=True).order_by(ApiKey.created_at.desc()).all()
    return {
        "keys": [
            {
                "id": str(k.id),
                "name": k.name or k.label,
                "prefix": k.key_prefix,
                "scope": k.scope,
                "last_used": k.last_used.isoformat() if k.last_used else None,
                "expires_at": k.expires_at.isoformat() if k.expires_at else None,
                "created_at": k.created_at.isoformat(),
            }
            for k in keys
        ]
    }


@router.post("/auth/keys/{key_id}/rotate")
def rotate_api_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    key = db.query(ApiKey).filter_by(id=key_id, user_id=current_user.id, is_active=True).first()
    if not key:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Key not found."})

    key.is_active = False

    raw_key = _generate_api_key()
    new_key = ApiKey(
        user_id=current_user.id,
        key_hash=_hash_key(raw_key),
        key_prefix=raw_key[:8],
        key_value=raw_key,
        name=key.name,
        scope=key.scope,
        expires_at=key.expires_at,
    )
    db.add(new_key)
    db.commit()
    return {"key": raw_key, "id": str(new_key.id), "prefix": new_key.key_prefix}


@router.delete("/auth/keys/{key_id}")
def revoke_api_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    key = db.query(ApiKey).filter_by(id=key_id, user_id=current_user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND"})
    key.is_active = False
    db.commit()
    return {"ok": True}
