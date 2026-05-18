"""create bchemxtract_app non-superuser role for runtime queries

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-05-16 17:00:00.000000+00:00

Phase 11 follow-up. The bootstrap POSTGRES_USER has SUPERUSER + BYPASSRLS,
which silently disables RLS even with FORCE ROW LEVEL SECURITY. This
migration creates ``bchemxtract_app`` (NOSUPERUSER NOBYPASSRLS) for the
runtime backend / celery services; the migrate service stays on the
bootstrap superuser because it needs DDL privileges.

Password is read from ``APP_DB_PASSWORD``. Re-running the migration
ALTERs the existing role (idempotent rotation). Future tables auto-grant
to the app role via ALTER DEFAULT PRIVILEGES.
"""

from __future__ import annotations

import os
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "bchemxtract_app"
MIN_PASSWORD_LEN = 32

# Identical attribute clause for both CREATE and ALTER paths.
_ROLE_ATTRS = "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION LOGIN"


def upgrade() -> None:
    password = os.environ.get("APP_DB_PASSWORD")
    if not password:
        raise RuntimeError(
            f"APP_DB_PASSWORD env var must be set to create runtime DB role "
            f"`{APP_ROLE}`. deploy.sh mints this on first run; see .env.example."
        )
    if len(password) < MIN_PASSWORD_LEN:
        raise RuntimeError(
            f"APP_DB_PASSWORD must be at least {MIN_PASSWORD_LEN} characters "
            f"(got {len(password)}). Use `openssl rand -hex 32`."
        )

    # PG DDL does not accept bind parameters for PASSWORD; escape single
    # quotes for the string literal (canonical PG escaping — equivalent to
    # what SQL's quote_literal() emits).
    pwd_escaped = password.replace("'", "''")

    # Idempotent CREATE-or-ALTER: re-running the migration rotates the
    # password without raising.
    op.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                CREATE ROLE {APP_ROLE} WITH {_ROLE_ATTRS} PASSWORD '{pwd_escaped}';
            ELSE
                ALTER ROLE {APP_ROLE} WITH {_ROLE_ATTRS} PASSWORD '{pwd_escaped}';
            END IF;
        END $$;
    """)

    # Schema usage + CRUD on every existing table.
    op.execute(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}")
    op.execute(
        f"GRANT SELECT, INSERT, UPDATE, DELETE "
        f"ON ALL TABLES IN SCHEMA public TO {APP_ROLE}"
    )
    op.execute(f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {APP_ROLE}")

    # Future tables (created by later migrations running as the bootstrap
    # superuser) auto-grant to the app role.
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {APP_ROLE}"
    )
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"GRANT USAGE, SELECT ON SEQUENCES TO {APP_ROLE}"
    )

    # alembic_version is touched only by alembic (running as the bootstrap
    # superuser). Revoke runtime write access so the app role cannot tamper
    # with migration bookkeeping.
    op.execute(
        f"REVOKE INSERT, UPDATE, DELETE ON TABLE alembic_version FROM {APP_ROLE}"
    )


def downgrade() -> None:
    # Revoke in inverse order, then drop. IF EXISTS keeps the downgrade
    # idempotent even on a partially-applied state.
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM {APP_ROLE}"
    )
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"REVOKE USAGE, SELECT ON SEQUENCES FROM {APP_ROLE}"
    )
    op.execute(
        f"REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM {APP_ROLE}"
    )
    op.execute(
        f"REVOKE SELECT, INSERT, UPDATE, DELETE "
        f"ON ALL TABLES IN SCHEMA public FROM {APP_ROLE}"
    )
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {APP_ROLE}")
    op.execute(f"DROP ROLE IF EXISTS {APP_ROLE}")
