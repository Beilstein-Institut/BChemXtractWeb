"""add canonical_smiles to substances + backfill via CDK

Revision ID: c3d4e5f6a7b8
Revises: 850c00d963f1
Create Date: 2026-04-17 12:30:00.000000+00:00

Per D-05: CDK canonical SMILES are required for SRCH-03 exact-match queries.
This migration:
  1. Adds a nullable ``canonical_smiles`` Text column to ``substances``.
  2. Creates a B-tree index ``ix_substances_canonical_smiles``.
  3. Creates a B-tree index ``ix_substances_molecular_formula`` (SRCH-02).
  4. Backfills every existing row's ``canonical_smiles`` via CDK by calling
     :func:`app.services.canonicalize.canonicalize_smiles_blocking` through
     the JVM bridge (initialized idempotently if not already started).

Idempotency: the backfill uses ``WHERE canonical_smiles IS NULL`` so re-runs
are no-ops. Rows whose ``smiles`` can't be parsed by CDK stay literal SQL
NULL (the ``if canon:`` guard ensures the ``UPDATE`` only fires on
successfully canonicalized rows) — per threat model T-09-02-07.
"""
from __future__ import annotations

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

logger = logging.getLogger("alembic.runtime.migration")

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "850c00d963f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BACKFILL_BATCH = 500


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

    # 3. JVM-backed data backfill. initialize_jvm() is idempotent; if the
    # app process already started the JVM (production startup), this is a
    # no-op. In test/standalone alembic runs, it starts the JVM fresh.
    import jpype

    from app.config import settings
    from app.services.jvm_bridge import initialize_jvm

    if not jpype.isJVMStarted():
        initialize_jvm(settings)

    # Import canonicalize AFTER JVM start — the module-level JClass loads
    # happen lazily on first call so import is safe either way, but calling
    # the helper requires a live JVM.
    from app.services.canonicalize import canonicalize_smiles_blocking

    connection = op.get_bind()
    offset = 0
    total_updated = 0
    while True:
        rows = connection.execute(
            sa.text(
                "SELECT id, smiles FROM substances "
                "WHERE canonical_smiles IS NULL AND smiles != '' "
                "ORDER BY id LIMIT :batch OFFSET :offset"
            ),
            {"batch": BACKFILL_BATCH, "offset": offset},
        ).fetchall()
        if not rows:
            break
        for row_id, smi in rows:
            canon = canonicalize_smiles_blocking(smi)
            if canon:
                # D-09 / fix #9: unparsable rows stay literal SQL NULL.
                # Only UPDATE on a non-empty canonical result.
                connection.execute(
                    sa.text(
                        "UPDATE substances SET canonical_smiles = :c "
                        "WHERE id = :id"
                    ),
                    {"c": canon, "id": row_id},
                )
                total_updated += 1
        offset += BACKFILL_BATCH
        logger.info(
            "canonical_smiles backfill progress: %d updated so far",
            total_updated,
        )
    logger.info(
        "canonical_smiles backfill complete: %d rows updated", total_updated
    )


def downgrade() -> None:
    op.drop_index(
        "ix_substances_molecular_formula", table_name="substances"
    )
    op.drop_index(
        "ix_substances_canonical_smiles", table_name="substances"
    )
    op.drop_column("substances", "canonical_smiles")
