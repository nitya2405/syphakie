"""remove BYOK: drop user_provider_keys table, reset requires_user_key

Revision ID: e5f6a7b8c9d0
Revises: 229c938c6fb6, d4e5f6a7b8c9
Create Date: 2026-04-21 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d0'
down_revision = ('229c938c6fb6', 'd4e5f6a7b8c9')
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE model_registry SET requires_user_key = false")
    op.drop_table('user_provider_keys')


def downgrade() -> None:
    op.create_table(
        'user_provider_keys',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('provider', sa.String(), nullable=False),
        sa.Column('encrypted_key', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
