import hashlib
from fastapi import Depends, Header
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from app.db.session import get_db
from app.models.api_key import ApiKey
from app.models.user import User
from app.core.exceptions import InvalidAPIKeyError, ForbiddenError


def get_current_user(
    x_api_key: str = Header(..., alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> User:
    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()

    api_key = (
        db.query(ApiKey)
        .filter(ApiKey.key_hash == key_hash, ApiKey.is_active == True)
        .first()
    )

    if not api_key:
        raise InvalidAPIKeyError()

    user = db.query(User).filter(User.id == api_key.user_id, User.is_active == True).first()

    if not user:
        raise InvalidAPIKeyError()

    # Update last_used timestamp
    api_key.last_used = func.now()
    db.commit()

    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise ForbiddenError()
    return current_user
