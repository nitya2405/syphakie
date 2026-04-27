"""Add preferences column to telegram_connections

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = 'h8i9j0k1l2m3'
down_revision = 'g7h8i9j0k1l2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'telegram_connections',
        sa.Column('preferences', JSONB, nullable=False, server_default='{}'),
    )


def downgrade():
    op.drop_column('telegram_connections', 'preferences')
