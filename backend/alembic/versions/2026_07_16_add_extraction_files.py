"""add extraction_files table (raw uploaded bytes for reaction re-extract)

Revision ID: 33c8881fdb5f
Revises: b2c3d4e5f6a7
Create Date: 2026-07-16 00:00:00.000000+00:00

Stores the raw uploaded CDX/CDXML bytes 1:1 with an extraction so reactions
can be extracted from a history entry without re-uploading the file. CASCADE
delete + FORCE RLS mirror extraction_substances. No data backfill — bytes for
pre-existing extractions are unrecoverable; those keep the re-upload fallback.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "33c8881fdb5f"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OWNER_PREDICATE = (
    "session_id = NULLIF(current_setting('app.session_id', true), '') "
    "OR api_key_hash = "
    "NULLIF(current_setting('app.api_key_hash', true), '')::bytea"
)


def upgrade() -> None:
    op.create_table(
        "extraction_files",
        sa.Column("extraction_id", sa.BigInteger(), nullable=False),
        sa.Column("content", postgresql.BYTEA(), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=True),
        sa.Column("api_key_hash", postgresql.BYTEA(), nullable=True),
        sa.ForeignKeyConstraint(
            ["extraction_id"], ["extractions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("extraction_id"),
    )
    op.create_index(
        "ix_extraction_files_session_id", "extraction_files", ["session_id"]
    )
    op.create_index(
        "ix_extraction_files_api_key_hash", "extraction_files", ["api_key_hash"]
    )
    op.execute("ALTER TABLE extraction_files ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE extraction_files FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY extraction_files_isolation ON extraction_files "
        f"USING ({_OWNER_PREDICATE}) WITH CHECK ({_OWNER_PREDICATE})"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS extraction_files_isolation ON extraction_files")
    op.drop_index("ix_extraction_files_api_key_hash", table_name="extraction_files")
    op.drop_index("ix_extraction_files_session_id", table_name="extraction_files")
    op.drop_table("extraction_files")
