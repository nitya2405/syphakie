from sqlalchemy import Column, String, Boolean, DateTime, BigInteger
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.db.session import Base


class TelegramConnection(Base):
    __tablename__ = "telegram_connections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    chat_id = Column(BigInteger, nullable=False, unique=True, index=True)
    username = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    connected_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
