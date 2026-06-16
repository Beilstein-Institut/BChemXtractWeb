"""add pubchem_compounds reference cache table

Revision ID: d5e6f7a8b9c0
Revises: a1b2c3d4e5f6
Create Date: 2026-06-16 12:00:00.000000+00:00

Public PubChem reference data keyed by full InChIKey. No RLS and no
per-session ownership columns — it stores facts about compounds, never who
looked them up. An explicit GRANT to the runtime app role is added for
self-documentation even though ALTER DEFAULT PRIVILEGES (set in the
2026_05_16 role migration) already auto-grants future tables.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d5e6f7a8b9c0"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "bchemxtract_app"


def upgrade() -> None:
    op.create_table(
        "pubchem_compounds",
        sa.Column("inchi_key", sa.String(length=27), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("cid", sa.BigInteger(), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("iupac_name", sa.Text(), nullable=True),
        sa.Column("molecular_formula", sa.String(length=255), nullable=True),
        sa.Column("molecular_weight", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("canonical_smiles", sa.Text(), nullable=True),
        sa.Column("isomeric_smiles", sa.Text(), nullable=True),
        sa.Column("xlogp", sa.Float(), nullable=True),
        sa.Column("synonyms", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("description_source", sa.Text(), nullable=True),
        sa.Column(
            "connectivity_cid_count",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("detail_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("inchi_key"),
    )
    # Explicit grant (idempotent; ALTER DEFAULT PRIVILEGES already covers it).
    op.execute(
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pubchem_compounds TO {APP_ROLE}"
    )


def downgrade() -> None:
    op.drop_table("pubchem_compounds")
