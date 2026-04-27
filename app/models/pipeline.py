from sqlalchemy import Column, String, Boolean, DateTime, Integer, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.db.session import Base


class Pipeline(Base):
    """A saved multi-modal pipeline definition."""
    __tablename__ = "pipelines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # steps: [{"step": 1, "modality": "text", "model_id": "...", "prompt_template": "...", "input_from": "user"|"step:N"}]
    steps = Column(JSON, nullable=False)
    is_public = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PipelineRun(Base):
    """A single execution of a pipeline."""
    __tablename__ = "pipeline_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pipeline_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    status = Column(String, nullable=False, default="running")  # running | completed | failed
    input_prompt = Column(Text, nullable=True)
    # step_outputs: {"1": {"content": "...", "url": "..."}, "2": {...}}
    step_outputs = Column(JSON, nullable=True, default=dict)
    total_credits = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
