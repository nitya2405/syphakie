"""org enhancements: description field, multi-org support

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-21 01:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('organizations', sa.Column('description', sa.String(), nullable=True))


def downgrade():
    op.drop_column('organizations', 'description')
