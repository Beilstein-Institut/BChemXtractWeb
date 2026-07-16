"""split dedup_key from inchi_key on substances

Revision ID: b2c3d4e5f6a7
Revises: f7a8b9c0d1e2
Create Date: 2026-07-16 00:00:00.000000+00:00

substances.inchi_key was UNIQUE NOT NULL and doubled as the dedup key, so
InChI-less substances (oversized molecules, fallback extractor path) had a
fabricated "S<smiles-hash>-...-N" value stored in the InChIKey column. That
fake value leaked through CSV/JSON export and the raw API and is misleading now
that a real InChI/InChIKey can be generated on demand.

Split the two concerns:
  - dedup_key : the row's opaque stable identity (real InChIKey or "S…" hash);
                the UNIQUE / ON CONFLICT column. It has ALWAYS been this column,
                so we just rename it — every existing value is preserved and
                dedup continuity is exact.
  - inchi_key : ONLY a real, standard InChIKey; "" when the molecule has none.

Backfill copies the real InChIKeys into the new inchi_key column and leaves
surrogates as "". Reversible: downgrade folds dedup_key back into inchi_key,
restoring the prior single-column layout (surrogates included).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "f7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Standard 27-char InChIKey: 14 letters - 10 letters - 1 letter.
_REAL_INCHI_KEY = r"^[A-Z]{14}-[A-Z]{10}-[A-Z]$"
# Surrogate dedup shape minted by make_dedup_key: "S" + 13 hex + "-" + 10 hex
# + "-N". Every surrogate matches this exactly, so excluding it guarantees no
# fabricated value is ever copied into inchi_key — even the ~1-in-10^10
# surrogate whose hex digest is all A-F letters and would otherwise pass the
# real-key pattern above.
_SURROGATE_SHAPE = r"^S[0-9A-F]{13}-[0-9A-F]{10}-N$"


def upgrade() -> None:
    # 1. The existing inchi_key column has always BEEN the dedup key — rename
    #    it, and rename its UNIQUE constraint to match so a future
    #    autogenerate diff against the ORM (which names it
    #    substances_dedup_key_key) produces no spurious churn.
    op.alter_column("substances", "inchi_key", new_column_name="dedup_key")
    op.execute(
        "ALTER TABLE substances "
        "RENAME CONSTRAINT substances_inchi_key_key TO substances_dedup_key_key"
    )

    # 2. Fresh inchi_key column: holds only a real InChIKey, "" otherwise.
    op.add_column(
        "substances",
        sa.Column(
            "inchi_key",
            sa.String(length=27),
            nullable=False,
            server_default="",
        ),
    )

    # 3. Backfill real InChIKeys from the preserved dedup values; surrogates
    #    stay "" (no fabricated identifier is exposed). Copy only well-formed
    #    real keys AND never anything shaped like a surrogate.
    op.execute(
        "UPDATE substances SET inchi_key = dedup_key "
        f"WHERE dedup_key ~ '{_REAL_INCHI_KEY}' AND dedup_key !~ '{_SURROGATE_SHAPE}'"
    )

    # 4. Index for exact / prefix InChIKey search (no longer covered by the
    #    unique index, which now sits on dedup_key).
    op.create_index("ix_substances_inchi_key", "substances", ["inchi_key"])


def downgrade() -> None:
    op.drop_index("ix_substances_inchi_key", table_name="substances")
    op.drop_column("substances", "inchi_key")
    # Fold the dedup identity back into inchi_key — restores the exact prior
    # layout (surrogate "S…" values return to the inchi_key column).
    op.execute(
        "ALTER TABLE substances "
        "RENAME CONSTRAINT substances_dedup_key_key TO substances_inchi_key_key"
    )
    op.alter_column("substances", "dedup_key", new_column_name="inchi_key")
