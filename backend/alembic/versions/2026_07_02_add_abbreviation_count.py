"""add abbreviation_count column to extractions

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-07-02 00:00:00.000000+00:00

The Browse-page receipt reports how many ChemDraw abbreviations (Ph, Bn, TBS,
...) were expanded during extraction. Per-substance abbreviation maps are not
persisted (the ``substances`` table is deduplicated globally by InChIKey), so
we store the distinct count as an aggregate on the extraction row. Existing
rows default to 0 (their original abbreviation data is unrecoverable), which
reads honestly as "no abbreviations recorded" rather than a wrong number.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f7a8b9c0d1e2"
down_revision: str | None = "e6f7a8b9c0d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "extractions",
        sa.Column(
            "abbreviation_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("extractions", "abbreviation_count")
