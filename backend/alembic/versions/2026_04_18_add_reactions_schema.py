"""add reactions + extraction_reactions + reaction_count column

Revision ID: e7f8a9b0c1d2
Revises: c3d4e5f6a7b8
Create Date: 2026-04-18 14:00:00.000000+00:00

Plan 10 D-16, D-18 amended, D-20, D-21.

Creates:
  - reactions (long_rinchi_key UNIQUE dedup per D-18 amended — rinchi_key is
    always empty upstream; see 10-RESEARCH §Critical Finding 1).
  - extraction_reactions (M-to-N, CASCADE on both FKs for D-21).
Adds:
  - extractions.reaction_count INTEGER NOT NULL DEFAULT 0 (D-16, D-23).

No backfill — existing rows get reaction_count=0 until user re-extracts.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7f8a9b0c1d2"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. reaction_count column on existing extractions table (D-16)
    op.add_column(
        "extractions",
        sa.Column(
            "reaction_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    # 2. reactions table (D-16, D-17, D-18 amended)
    op.create_table(
        "reactions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("long_rinchi_key", sa.String(length=256), nullable=False),
        sa.Column(
            "rinchi_key",
            sa.Text(),
            nullable=False,
            server_default="",
        ),
        sa.Column("rinchi", sa.Text(), nullable=False, server_default=""),
        sa.Column("short_rinchi_key", sa.Text(), nullable=False, server_default=""),
        sa.Column("web_rinchi_key", sa.Text(), nullable=False, server_default=""),
        sa.Column("reaction_smiles", sa.Text(), nullable=False, server_default=""),
        sa.Column("aux_info", sa.Text(), nullable=False, server_default=""),
        sa.Column("svg", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "components",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "first_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("long_rinchi_key", name="uq_reactions_long_rinchi_key"),
    )
    op.create_index(
        "ix_reactions_long_rinchi_key",
        "reactions",
        ["long_rinchi_key"],
    )

    # 3. M-to-N join table (D-16, D-21)
    op.create_table(
        "extraction_reactions",
        sa.Column("extraction_id", sa.BigInteger(), nullable=False),
        sa.Column("reaction_id", sa.BigInteger(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["extraction_id"], ["extractions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["reaction_id"], ["reactions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("extraction_id", "reaction_id"),
        sa.UniqueConstraint(
            "extraction_id", "reaction_id", name="uq_extraction_reaction"
        ),
    )


def downgrade() -> None:
    op.drop_table("extraction_reactions")
    op.drop_index("ix_reactions_long_rinchi_key", table_name="reactions")
    op.drop_table("reactions")
    op.drop_column("extractions", "reaction_count")
