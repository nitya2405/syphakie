"""add telegram_connections, telegram_auth_tokens, telegram_states

Revision ID: g7h8i9j0k1l2
Revises: f6a7b8c9d0e1
Create Date: 2026-04-27 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'g7h8i9j0k1l2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'telegram_connections',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('chat_id', sa.BigInteger(), nullable=False),
        sa.Column('username', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('connected_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
        sa.UniqueConstraint('chat_id'),
    )
    op.create_index('ix_telegram_connections_user_id', 'telegram_connections', ['user_id'])
    op.create_index('ix_telegram_connections_chat_id', 'telegram_connections', ['chat_id'])

    op.create_table(
        'telegram_auth_tokens',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('token', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token'),
    )
    op.create_index('ix_telegram_auth_tokens_token', 'telegram_auth_tokens', ['token'])
    op.create_index('ix_telegram_auth_tokens_user_id', 'telegram_auth_tokens', ['user_id'])

    op.create_table(
        'telegram_states',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('chat_id', sa.BigInteger(), nullable=False),
        sa.Column('state', sa.String(), nullable=False),
        sa.Column('data', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id'),
    )


def downgrade() -> None:
    op.drop_table('telegram_states')
    op.drop_index('ix_telegram_auth_tokens_user_id', 'telegram_auth_tokens')
    op.drop_index('ix_telegram_auth_tokens_token', 'telegram_auth_tokens')
    op.drop_table('telegram_auth_tokens')
    op.drop_index('ix_telegram_connections_chat_id', 'telegram_connections')
    op.drop_index('ix_telegram_connections_user_id', 'telegram_connections')
    op.drop_table('telegram_connections')
