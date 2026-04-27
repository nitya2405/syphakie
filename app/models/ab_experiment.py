from sqlalchemy import Column, String, Boolean, DateTime, Integer, Numeric, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.db.session import Base


class ABExperiment(Base):
    __tablename__ = "ab_experiments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String, nullable=False)
    modality = Column(String, nullable=False)
    # variants: [{"model_id": "...", "provider": "...", "weight": 50}, ...]
    variants = Column(JSON, nullable=False)
    status = Column(String, nullable=False, default="active")  # active | paused | concluded
    winner_model_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    concluded_at = Column(DateTime(timezone=True), nullable=True)


class ABResult(Base):
    __tablename__ = "ab_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    model_id = Column(String, nullable=False)
    request_id = Column(String, nullable=False)
    latency_ms = Column(Integer, nullable=True)
    credits_used = Column(Numeric(10, 4), nullable=True)
    rating = Column(Integer, nullable=True)  # from user feedback
    created_at = Column(DateTime(timezone=True), server_default=func.now())
