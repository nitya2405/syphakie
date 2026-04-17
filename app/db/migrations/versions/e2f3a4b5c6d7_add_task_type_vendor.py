"""Add task_type and vendor columns to model_registry"""
import sqlalchemy as sa
from alembic import op

revision = "e2f3a4b5c6d7"
down_revision = "c9d1e2f3a4b5"


def upgrade():
    op.add_column("model_registry", sa.Column("task_type", sa.String(), nullable=True))
    op.add_column("model_registry", sa.Column("vendor", sa.String(), nullable=True))
    # Backfill defaults for existing rows
    op.execute(
        "UPDATE model_registry SET task_type = 'chat' WHERE modality = 'text' AND task_type IS NULL"
    )
    op.execute(
        "UPDATE model_registry SET task_type = 'text_to_image' WHERE modality = 'image' AND task_type IS NULL"
    )


def downgrade():
    op.drop_column("model_registry", "vendor")
    op.drop_column("model_registry", "task_type")
