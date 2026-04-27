"""add estimated_credits to usage_logs

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-04-21 13:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('usage_logs', sa.Column('estimated_credits', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('usage_logs', 'estimated_credits')
