from sqlalchemy import Column, String, Integer, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
import uuid
from app.db.session import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    status = Column(String, nullable=False, default="queued")  # queued|running|success|failed
    modality = Column(String, nullable=True)
    model_id = Column(String, nullable=True)
    provider = Column(String, nullable=True)
    input_payload = Column(JSON, nullable=True)
    output_url = Column(Text, nullable=True)
    output_content = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    credits_used = Column(Integer, nullable=True)
    request_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
