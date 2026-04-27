from sqlalchemy import Column, String, DateTime, Integer, Text, JSON, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.db.session import Base


class PromptCache(Base):
    """Exact-match prompt cache. Keyed on (modality, model_id, prompt_hash)."""
    __tablename__ = "prompt_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cache_key = Column(String, nullable=False, unique=True, index=True)  # sha256(modality+model_id+prompt)
    modality = Column(String, nullable=False)
    model_id = Column(String, nullable=False)
    prompt_text = Column(Text, nullable=False)
    output_content = Column(Text, nullable=True)
    output_url = Column(Text, nullable=True)
    output_type = Column(String, nullable=True)
    credits_saved = Column(Numeric(10, 4), nullable=True)
    hit_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_hit_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
