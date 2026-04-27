from sqlalchemy import Column, String, DateTime, BigInteger, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.db.session import Base


class TelegramState(Base):
    __tablename__ = "telegram_states"

    # One row per user; user_id is both PK and FK
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    chat_id = Column(BigInteger, nullable=False)
    state = Column(String, nullable=False)       # e.g. "awaiting_async_job"
    data = Column(JSONB, nullable=False, default=dict)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
