"""add WITH CHECK to the owner-scoped RLS policies

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-06-25 00:00:00.000000+00:00

The session-isolation policies (migration f1a2b3c4d5e6) were created with a
USING clause but no WITH CHECK. In PostgreSQL, USING governs which existing
rows are visible/updatable/deletable; WITH CHECK governs the values a new or
modified row may take on INSERT/UPDATE. With WITH CHECK omitted, an INSERT can
write any session_id / api_key_hash — including another tenant's — so a future
endpoint or ORM bug that let a value reach the owner columns could plant
cross-tenant rows (CWE-732, defense-in-depth).

This migration recreates each policy with WITH CHECK mirroring USING, turning
the server-side "owner columns are set from the request scope" discipline into
a database-enforced invariant. Downgrade restores the USING-only policies.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e6f7a8b9c0d1"
down_revision: str | None = "d5e6f7a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_TARGETS = ("extractions", "extraction_substances", "extraction_reactions")

# Owner predicate shared by USING and WITH CHECK so they can never drift.
_OWNER_PREDICATE = (
    "session_id = NULLIF(current_setting('app.session_id', true), '') "
    "OR api_key_hash = "
    "NULLIF(current_setting('app.api_key_hash', true), '')::bytea"
)


def upgrade() -> None:
    for table in _TARGETS:
        op.execute(f"DROP POLICY IF EXISTS {table}_isolation ON {table}")
        op.execute(
            f"CREATE POLICY {table}_isolation ON {table} "
            f"USING ({_OWNER_PREDICATE}) "
            f"WITH CHECK ({_OWNER_PREDICATE})"
        )


def downgrade() -> None:
    # Restore the USING-only policies (the pre-WITH CHECK state).
    for table in _TARGETS:
        op.execute(f"DROP POLICY IF EXISTS {table}_isolation ON {table}")
        op.execute(
            f"CREATE POLICY {table}_isolation ON {table} USING ({_OWNER_PREDICATE})"
        )
