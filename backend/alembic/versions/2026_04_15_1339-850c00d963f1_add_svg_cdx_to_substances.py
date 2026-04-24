"""add svg_cdx to substances

Revision ID: 850c00d963f1
Revises: b1c2d3e4f5a6
Create Date: 2026-04-15 13:39:14.425307+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "850c00d963f1"
down_revision: str | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "substances",
        sa.Column("svg_cdx", sa.Text(), server_default="", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("substances", "svg_cdx")
