"""add_position_to_extraction_substances

Revision ID: a2b3c4d5e6f7
Revises: 81af6cfbd43d
Create Date: 2026-04-14 00:00:00.000000+00:00

Adds a stable extraction-order column to the extraction_substances join table
so the paginated substances endpoint (DISP-03) can return substances in a
repeatable order.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a2b3c4d5e6f7"
down_revision: str | None = "81af6cfbd43d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "extraction_substances",
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("extraction_substances", "position")
