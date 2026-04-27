from sqlalchemy import Column, String, Boolean, DateTime, Integer, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.db.session import Base


class Webhook(Base):
    __tablename__ = "webhooks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    url = Column(String, nullable=False)
    secret = Column(String, nullable=True)
    events = Column(JSON, nullable=False, default=list)  # ["generation.complete", "generation.failed"]
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    webhook_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    request_id = Column(String, nullable=True)
    event = Column(String, nullable=False)
    payload = Column(JSON, nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending | delivered | failed
    attempts = Column(Integer, nullable=False, default=0)
    last_response_code = Column(Integer, nullable=True)
    last_error = Column(Text, nullable=True)
    next_retry_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
