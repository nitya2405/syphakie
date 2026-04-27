"""Add task_types array column to model_registry"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "f3a4b5c6d7e8"
down_revision = "e2f3a4b5c6d7"


def upgrade():
    op.add_column(
        "model_registry",
        sa.Column("task_types", postgresql.ARRAY(sa.String()), nullable=True),
    )
    # Backfill from existing task_type
    op.execute(
        "UPDATE model_registry SET task_types = ARRAY[task_type] WHERE task_type IS NOT NULL"
    )


def downgrade():
    op.drop_column("model_registry", "task_types")
