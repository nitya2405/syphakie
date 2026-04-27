"""Platform expansion: orgs, notifications, audit_logs, api_key improvements, stripe fields"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "f3a4b5c6d7e8"


def upgrade():
    # ── api_keys: add expires_at, scope, name ─────────────────────────────
    op.add_column("api_keys", sa.Column("name", sa.String(), nullable=True))
    op.add_column("api_keys", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("api_keys", sa.Column("scope", sa.String(), nullable=True))  # null = all

    # ── users: stripe customer id ─────────────────────────────────────────
    op.add_column("users", sa.Column("stripe_customer_id", sa.String(), nullable=True))
    op.add_column("users", sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=True))

    # ── organizations ─────────────────────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False, unique=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("credits_balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stripe_customer_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── org_memberships ───────────────────────────────────────────────────
    op.create_table(
        "org_memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="member"),  # owner|admin|member|viewer
        sa.Column("invited_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("org_id", "user_id", name="uq_org_member"),
    )

    # ── notifications ─────────────────────────────────────────────────────
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(), nullable=False),       # credits_low|key_expiring|job_done|system
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.String(), nullable=True),
        sa.Column("link", sa.String(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── audit_logs ────────────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(), nullable=False),     # signup|login|generate|key_rotated|credits_added
        sa.Column("resource_type", sa.String(), nullable=True),
        sa.Column("resource_id", sa.String(), nullable=True),
        sa.Column("meta", postgresql.JSONB(), nullable=True),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── credit_transactions ───────────────────────────────────────────────
    op.create_table(
        "credit_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),    # positive = topup, negative = usage
        sa.Column("type", sa.String(), nullable=False),       # topup|usage|refund|adjustment
        sa.Column("stripe_payment_intent", sa.String(), nullable=True),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── prompt_templates ──────────────────────────────────────────────────
    op.create_table(
        "prompt_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("modality", sa.String(), nullable=True),
        sa.Column("model_id", sa.String(), nullable=True),
        sa.Column("params", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── request_records: add task_type ────────────────────────────────────
    op.add_column("request_records", sa.Column("task_type", sa.String(), nullable=True))
    op.add_column("request_records", sa.Column("prompt_tokens", sa.Integer(), nullable=True))
    op.add_column("request_records", sa.Column("completion_tokens", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("request_records", "completion_tokens")
    op.drop_column("request_records", "prompt_tokens")
    op.drop_column("request_records", "task_type")
    op.drop_table("prompt_templates")
    op.drop_table("credit_transactions")
    op.drop_table("audit_logs")
    op.drop_table("notifications")
    op.drop_table("org_memberships")
    op.drop_table("organizations")
    op.drop_column("users", "org_id")
    op.drop_column("users", "stripe_customer_id")
    op.drop_column("api_keys", "scope")
    op.drop_column("api_keys", "expires_at")
    op.drop_column("api_keys", "name")
