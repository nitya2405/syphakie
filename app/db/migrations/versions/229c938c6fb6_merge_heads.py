"""merge heads

Revision ID: 229c938c6fb6
Revises: a1b2c3d4e5f6, c3d4e5f6a7b8
Create Date: 2026-04-21 10:44:07.521982

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '229c938c6fb6'
down_revision: Union[str, None] = ('a1b2c3d4e5f6', 'c3d4e5f6a7b8')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
