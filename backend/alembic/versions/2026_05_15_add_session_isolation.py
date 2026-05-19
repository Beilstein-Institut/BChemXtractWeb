"""add session_id + api_key_hash + api_keys + audit_log + RLS policies

Revision ID: f1a2b3c4d5e6
Revises: e7f8a9b0c1d2
Create Date: 2026-05-15 00:00:00.000000+00:00

Phase 11 D-01, D-02, D-04, D-10, D-13, D-16, D-17.

Adds per-row ownership columns (session_id + api_key_hash) to extractions
+ extraction_substances + extraction_reactions. Creates api_keys
(admin-issued credentials, D-10) and audit_log (append-only event trail,
D-16). Wipes legacy unscoped rows BEFORE enabling RLS (D-04 — order
matters; see RESEARCH.md Pitfall #1 [T-11-14]). Then ENABLE + FORCE RLS
+ one OR-semantics policy per target table.

Downgrade reverses every change in inverse order. NOTE: rows deleted by
the D-04 wipe are NOT restored on downgrade — this is a documented,
accepted cost (pre-RLS data had no owner and could not be safely
re-isolated).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: str | None = "e7f8a9b0c1d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_TARGETS = ("extractions", "extraction_substances", "extraction_reactions")


def upgrade() -> None:
    # 1. Add session_id + api_key_hash to the three target tables.
    for table in _TARGETS:
        op.add_column(
            table,
            sa.Column("session_id", sa.String(length=36), nullable=True),
        )
        op.add_column(
            table,
            sa.Column("api_key_hash", postgresql.BYTEA(), nullable=True),
        )
        op.create_index(f"ix_{table}_session_id", table, ["session_id"])
        op.create_index(f"ix_{table}_api_key_hash", table, ["api_key_hash"])

    # 2. New table: api_keys (D-10).
    op.create_table(
        "api_keys",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("key_hash", postgresql.BYTEA(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "request_count",
            sa.BigInteger(),
            server_default="0",
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key_hash", name="uq_api_keys_key_hash"),
    )

    # 3. New table: audit_log (D-16).
    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("session_id_hash", postgresql.BYTEA(), nullable=True),
        sa.Column("api_key_hash", postgresql.BYTEA(), nullable=True),
        sa.Column("ip_inet", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("event", sa.String(length=64), nullable=False),
        sa.Column("target_id", sa.Text(), nullable=True),
        sa.Column(
            "at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "meta",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_log_event_at", "audit_log", ["event", sa.text("at DESC")])
    op.create_index("ix_audit_log_at", "audit_log", ["at"])

    # 4. D-04 — wipe legacy unscoped rows BEFORE enabling RLS.
    #    Ordering note (RESEARCH.md Pitfall #1 — T-11-14): if we ENABLE
    #    first, the DELETE runs with app.session_id unset → policy
    #    evaluates NULL = NULL → false → DELETE removes zero rows → app
    #    starts up with legacy data invisible to all sessions. Order:
    #    DELETE → ENABLE → FORCE → POLICY.
    #
    #    The DELETE on extractions cascades to both join tables via the
    #    existing CASCADE FKs (orm.py:124-132, 194-202). The join-table
    #    DELETEs below are defensive — they should remove zero rows.
    op.execute(
        "DELETE FROM extractions WHERE session_id IS NULL AND api_key_hash IS NULL"
    )
    op.execute(
        "DELETE FROM extraction_substances "
        "WHERE session_id IS NULL AND api_key_hash IS NULL"
    )
    op.execute(
        "DELETE FROM extraction_reactions "
        "WHERE session_id IS NULL AND api_key_hash IS NULL"
    )

    # 5. Enable + FORCE RLS + policy per target table (D-01, D-02).
    for table in _TARGETS:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY {table}_isolation ON {table}
            USING (
                session_id = NULLIF(current_setting('app.session_id', true), '')
                OR api_key_hash =
                    NULLIF(current_setting('app.api_key_hash', true), '')::bytea
            )
            """
        )


def downgrade() -> None:
    # Inverse order: drop policies → disable RLS → drop new tables → drop
    # indexes → drop columns. The data wipe is NOT reversed (rows are
    # gone — see docstring).
    for table in _TARGETS:
        op.execute(f"DROP POLICY IF EXISTS {table}_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    op.drop_index("ix_audit_log_at", table_name="audit_log")
    op.drop_index("ix_audit_log_event_at", table_name="audit_log")
    op.drop_table("audit_log")

    op.drop_table("api_keys")

    for table in _TARGETS:
        op.drop_index(f"ix_{table}_api_key_hash", table_name=table)
        op.drop_index(f"ix_{table}_session_id", table_name=table)
        op.drop_column(table, "api_key_hash")
        op.drop_column(table, "session_id")
