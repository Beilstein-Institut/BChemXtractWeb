"""add batch_id to extractions

Revision ID: b1c2d3e4f5a6
Revises: a2b3c4d5e6f7
Create Date: 2026-04-14 00:00:00.000000+00:00

Adds batch_id column to extractions table for bulk processing.
batch_id is a UUID4 string (36 chars) linking an extraction to its batch.
Nullable because single-file extractions have no batch.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "a2b3c4d5e6f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("extractions", sa.Column("batch_id", sa.String(36), nullable=True))
    op.create_index("ix_extractions_batch_id", "extractions", ["batch_id"])


def downgrade() -> None:
    op.drop_index("ix_extractions_batch_id", table_name="extractions")
    op.drop_column("extractions", "batch_id")
