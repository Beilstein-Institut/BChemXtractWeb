"""add occurrences to extraction_substances

Revision ID: f6fa34aa00f0
Revises: 33c8881fdb5f
Create Date: 2026-07-20 08:34:56.389293+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6fa34aa00f0"
down_revision: str | None = "33c8881fdb5f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "extraction_substances",
        sa.Column(
            "occurrences",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("extraction_substances", "occurrences")
