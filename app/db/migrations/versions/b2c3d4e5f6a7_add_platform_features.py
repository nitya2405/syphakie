"""add platform features: webhooks, ratings, experiments, pipelines, finetune, cache

Revision ID: b2c3d4e5f6a7
Revises: f3a4b5c6d7e8
Create Date: 2026-04-20 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b2c3d4e5f6a7'
down_revision = 'f3a4b5c6d7e8'
branch_labels = None
depends_on = None


def upgrade():
    # webhooks
    op.create_table(
        'webhooks',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('url', sa.String, nullable=False),
        sa.Column('secret', sa.String, nullable=True),
        sa.Column('events', postgresql.JSON, nullable=False),
        sa.Column('is_active', sa.Boolean, nullable=False, default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        'webhook_deliveries',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('webhook_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('request_id', sa.String, nullable=True),
        sa.Column('event', sa.String, nullable=False),
        sa.Column('payload', postgresql.JSON, nullable=True),
        sa.Column('status', sa.String, nullable=False, default='pending'),
        sa.Column('attempts', sa.Integer, nullable=False, default=0),
        sa.Column('last_response_code', sa.Integer, nullable=True),
        sa.Column('last_error', sa.Text, nullable=True),
        sa.Column('next_retry_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # model ratings
    op.create_table(
        'model_ratings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('request_id', sa.String, nullable=False, unique=True),
        sa.Column('model_id', sa.String, nullable=False, index=True),
        sa.Column('provider', sa.String, nullable=False),
        sa.Column('modality', sa.String, nullable=False),
        sa.Column('rating', sa.Integer, nullable=False),
        sa.Column('comment', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # A/B experiments
    op.create_table(
        'ab_experiments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('modality', sa.String, nullable=False),
        sa.Column('variants', postgresql.JSON, nullable=False),
        sa.Column('status', sa.String, nullable=False, default='active'),
        sa.Column('winner_model_id', sa.String, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('concluded_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        'ab_results',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('experiment_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('model_id', sa.String, nullable=False),
        sa.Column('request_id', sa.String, nullable=False),
        sa.Column('latency_ms', sa.Integer, nullable=True),
        sa.Column('credits_used', sa.Numeric(10, 4), nullable=True),
        sa.Column('rating', sa.Integer, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Pipelines
    op.create_table(
        'pipelines',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('steps', postgresql.JSON, nullable=False),
        sa.Column('is_public', sa.Boolean, nullable=False, default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        'pipeline_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('pipeline_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('status', sa.String, nullable=False, default='running'),
        sa.Column('input_prompt', sa.Text, nullable=True),
        sa.Column('step_outputs', postgresql.JSON, nullable=True),
        sa.Column('total_credits', sa.Integer, nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )

    # Fine-tune jobs
    op.create_table(
        'finetune_jobs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('provider', sa.String, nullable=False),
        sa.Column('base_model_id', sa.String, nullable=False),
        sa.Column('display_name', sa.String, nullable=True),
        sa.Column('external_job_id', sa.String, nullable=True),
        sa.Column('status', sa.String, nullable=False, default='queued'),
        sa.Column('training_file_url', sa.Text, nullable=True),
        sa.Column('result_model_id', sa.String, nullable=True),
        sa.Column('params', postgresql.JSON, nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('credits_used', sa.Integer, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )

    # Prompt cache
    op.create_table(
        'prompt_cache',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('cache_key', sa.String, nullable=False, unique=True),
        sa.Column('modality', sa.String, nullable=False),
        sa.Column('model_id', sa.String, nullable=False),
        sa.Column('prompt_text', sa.Text, nullable=False),
        sa.Column('output_content', sa.Text, nullable=True),
        sa.Column('output_url', sa.Text, nullable=True),
        sa.Column('output_type', sa.String, nullable=True),
        sa.Column('credits_saved', sa.Numeric(10, 4), nullable=True),
        sa.Column('hit_count', sa.Integer, nullable=False, default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_hit_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_prompt_cache_key', 'prompt_cache', ['cache_key'])


def downgrade():
    op.drop_table('prompt_cache')
    op.drop_table('finetune_jobs')
    op.drop_table('pipeline_runs')
    op.drop_table('pipelines')
    op.drop_table('ab_results')
    op.drop_table('ab_experiments')
    op.drop_table('model_ratings')
    op.drop_table('webhook_deliveries')
    op.drop_table('webhooks')
