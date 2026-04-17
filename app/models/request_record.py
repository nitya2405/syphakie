from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.db.session import Base


class RequestRecord(Base):
    __tablename__ = "request_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    provider = Column(String, nullable=True)        # filled after routing
    model_id = Column(String, nullable=True)        # filled after routing
    modality = Column(String, nullable=False)
    routing_mode = Column(String, nullable=False)
    status = Column(String, nullable=False)         # "pending" | "success" | "failed"
    input_payload = Column(JSON, nullable=False)    # prompt + params, no secrets
    output_path = Column(String, nullable=True)
    output_url = Column(String, nullable=True)
    credits_deducted = Column(Integer, nullable=False, default=0)
    latency_ms = Column(Integer, nullable=True)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
