from sqlalchemy import Column, String, Boolean, DateTime, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func
import uuid
from app.db.session import Base


class ModelRegistry(Base):
    __tablename__ = "model_registry"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider = Column(String, nullable=False)       # "openai"
    model_id = Column(String, nullable=False)       # "gpt-4o"
    modality = Column(String, nullable=False)       # "text" | "image"
    display_name = Column(String, nullable=False)
    cost_per_unit = Column(Numeric(10, 6), nullable=False)  # credits per token or per image
    unit_type = Column(String, nullable=False)      # "token" | "image"
    avg_latency_ms = Column(Integer, nullable=True)
    quality_score = Column(Numeric(3, 2), nullable=True)
    task_type = Column(String, nullable=True)        # primary task type (first of task_types)
    task_types = Column(ARRAY(String), nullable=True)  # all supported task types
    vendor = Column(String, nullable=True)           # underlying model vendor when provider is a proxy (e.g. fal)
    is_active = Column(Boolean, nullable=False, default=True)
    requires_user_key = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint("provider", "model_id", name="uq_provider_model"),
    )
