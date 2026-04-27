from sqlalchemy import Column, String, DateTime, Integer, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.db.session import Base


class FinetuneJob(Base):
    __tablename__ = "finetune_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    provider = Column(String, nullable=False)        # "openai" | "replicate" | "fal"
    base_model_id = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    external_job_id = Column(String, nullable=True)  # provider's job ID
    status = Column(String, nullable=False, default="queued")  # queued|running|succeeded|failed|cancelled
    training_file_url = Column(Text, nullable=True)
    result_model_id = Column(String, nullable=True)  # fine-tuned model ID once done
    # params: {"epochs": 3, "learning_rate": 1e-4, ...}
    params = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    credits_used = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
