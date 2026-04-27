"""add jobs table and org credits default

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-21 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'jobs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('status', sa.String, nullable=False, server_default='queued'),
        sa.Column('modality', sa.String, nullable=True),
        sa.Column('model_id', sa.String, nullable=True),
        sa.Column('provider', sa.String, nullable=True),
        sa.Column('input_payload', postgresql.JSON, nullable=True),
        sa.Column('output_url', sa.Text, nullable=True),
        sa.Column('output_content', sa.Text, nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('credits_used', sa.Integer, nullable=True),
        sa.Column('request_id', sa.String, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.alter_column(
        'organizations', 'credits_balance',
        server_default='2500',
        existing_type=sa.Integer(),
        existing_nullable=False,
    )


def downgrade():
    op.drop_table('jobs')
    op.alter_column(
        'organizations', 'credits_balance',
        server_default='0',
        existing_type=sa.Integer(),
        existing_nullable=False,
    )
