"""add canonical_smiles column + indexes (pure DDL; backfill is a separate CLI)

Revision ID: c3d4e5f6a7b8
Revises: 850c00d963f1
Create Date: 2026-04-17 12:30:00.000000+00:00

Per D-05 + SEC M-09: CDK canonical SMILES are required for SRCH-03
exact-match queries. This migration is **pure DDL** — it adds the column
and the two supporting indexes, then returns. The JVM-backed data
backfill has been extracted into a standalone management command
(``python -m scripts.backfill_canonical_smiles``) so schema migrations
run without a JVM dependency and finish in milliseconds.

Operators upgrading past this revision must run the backfill
explicitly::

    python -m scripts.backfill_canonical_smiles --batch-size 1000

The backfill is idempotent: re-running is a no-op. Rows whose ``smiles``
cannot be parsed by CDK remain literal SQL NULL.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "850c00d963f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Schema: add nullable canonical_smiles Text column.
    op.add_column(
        "substances",
        sa.Column("canonical_smiles", sa.Text(), nullable=True),
    )
    # 2. B-tree indexes for search (SRCH-02 formula + SRCH-03 canonical SMILES).
    op.create_index(
        "ix_substances_canonical_smiles",
        "substances",
        ["canonical_smiles"],
    )
    op.create_index(
        "ix_substances_molecular_formula",
        "substances",
        ["molecular_formula"],
    )
    # Data backfill is NOT run here — run scripts/backfill_canonical_smiles.py
    # after upgrading. See module docstring for the rationale (SEC M-09).


def downgrade() -> None:
    op.drop_index(
        "ix_substances_molecular_formula", table_name="substances"
    )
    op.drop_index(
        "ix_substances_canonical_smiles", table_name="substances"
    )
    op.drop_column("substances", "canonical_smiles")
