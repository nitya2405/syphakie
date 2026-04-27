from sqlalchemy import Column, String, Boolean, DateTime, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.db.session import Base


class ModelRating(Base):
    __tablename__ = "model_ratings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    request_id = Column(String, nullable=False, unique=True)
    model_id = Column(String, nullable=False, index=True)
    provider = Column(String, nullable=False)
    modality = Column(String, nullable=False)
    rating = Column(Integer, nullable=False)  # 1 (thumbs down) or 5 (thumbs up)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
