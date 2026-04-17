"""
Creates the first admin user, generates an API key, assigns starting credits.
The raw API key is printed ONCE — copy it, it is never stored in plain text.

Usage:
    python scripts/bootstrap.py
    python scripts/bootstrap.py admin@syphakie.local
"""
import sys
import os
import hashlib
import secrets

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
from app.models.user import User
from app.models.api_key import ApiKey
from app.models.credit import Credit
from app.config import settings


def bootstrap(email: str = "admin@syphakie.local", name: str = "Admin"):
    db = SessionLocal()

    existing = db.query(User).filter_by(email=email).first()
    if existing:
        print(f"User '{email}' already exists. Skipping.")
        db.close()
        return

    # 1. Create admin user
    user = User(email=email, name=name, role="admin", is_active=True)
    db.add(user)
    db.flush()  # get user.id without committing

    # 2. Generate API key
    raw_key = "sk-" + secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:8]

    api_key = ApiKey(
        user_id=user.id,
        key_hash=key_hash,
        key_prefix=key_prefix,
        label="bootstrap-admin-key",
        is_active=True,
    )
    db.add(api_key)

    # 3. Assign starting credits
    credit = Credit(user_id=user.id, balance=settings.DEFAULT_CREDITS)
    db.add(credit)

    db.commit()
    db.close()

    print("=" * 60)
    print(f"  Admin user : {email}")
    print(f"  API Key    : {raw_key}")
    print(f"  Credits    : {settings.DEFAULT_CREDITS}")
    print("=" * 60)
    print("  ⚠  Save this key — it will NOT be shown again.")
    print("=" * 60)


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "admin@syphakie.local"
    bootstrap(email)
