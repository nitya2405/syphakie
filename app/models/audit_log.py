from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
from app.db.session import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    org_id = Column(UUID(as_uuid=True), nullable=True)
    action = Column(String, nullable=False)        # signup|login|generate|key_rotated|credits_added
    resource_type = Column(String, nullable=True)
    resource_id = Column(String, nullable=True)
    meta = Column(JSONB, nullable=True)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
