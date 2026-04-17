"""add auth fields: password_hash, phone_number, key_value

Revision ID: c9d1e2f3a4b5
Revises: fe0c71d4f4c6
Create Date: 2026-04-17 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "c9d1e2f3a4b5"
down_revision: Union[str, None] = "fe0c71d4f4c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(), nullable=True))
    op.add_column("users", sa.Column("phone_number", sa.String(), nullable=True))
    op.add_column("api_keys", sa.Column("key_value", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("api_keys", "key_value")
    op.drop_column("users", "phone_number")
    op.drop_column("users", "password_hash")
