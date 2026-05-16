"""create bchemxtract_app non-superuser role for runtime queries

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-05-16 17:00:00.000000+00:00

Phase 11 follow-up. Playwright verification of Plan 11-03's session-isolation
contract revealed that the runtime DB role (POSTGRES_USER, the bootstrap user)
has SUPERUSER + BYPASSRLS — which bypasses RLS policies even with FORCE ROW
LEVEL SECURITY enabled. The policies and FORCE flag are architecturally
correct (a non-superuser role returns 0 rows for the wrong session as
expected); the leak is operational.

This migration creates ``bchemxtract_app``, a runtime role with
NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION. The backend,
celery-worker, and celery-beat services connect as this role for every user
query. The migrate service stays on the bootstrap superuser because it needs
DDL privileges to create policies and add columns.

Password is read from ``APP_DB_PASSWORD``. The migration refuses to run
without it. To rotate the password later: update .env, run
``psql -U <superuser> -c "ALTER ROLE bchemxtract_app PASSWORD '<new>'"``, then
restart the backend / celery containers (deploy.sh --rotate-app-db handles
this end-to-end).

Tables that already exist get explicit GRANTs. Future tables auto-grant via
ALTER DEFAULT PRIVILEGES, scoped to objects created by the bootstrap role
(i.e. by alembic migrations).
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


def upgrade() -> None:
    password = os.environ.get("APP_DB_PASSWORD")
    if not password:
        raise RuntimeError(
            "APP_DB_PASSWORD env var must be set to create the runtime DB role "
            f"`{APP_ROLE}`. deploy.sh mints this on first run; see .env.example. "
            "Re-run alembic upgrade head with APP_DB_PASSWORD in the environment."
        )

    # Sanity check: refuse short / empty passwords. The superuser role above
    # already has its own POSTGRES_PASSWORD ≥ 32 chars policy; mirror that
    # discipline on the runtime role.
    if len(password) < 32:
        raise RuntimeError(
            f"APP_DB_PASSWORD must be at least 32 characters (got {len(password)}). "
            "Use `openssl rand -hex 32` or a similar entropy source."
        )

    # Escape single quotes defensively (deploy.sh mints alphanumeric hex, but
    # users might paste their own). The PASSWORD clause does not accept bind
    # parameters in PostgreSQL DDL.
    pwd_escaped = password.replace("'", "''")

    # Idempotent role creation: CREATE if missing, ALTER if present. The ALTER
    # path lets re-running this migration update the password without errors.
    op.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                CREATE ROLE {APP_ROLE}
                    WITH NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE
                         NOREPLICATION LOGIN
                         PASSWORD '{pwd_escaped}';
            ELSE
                ALTER ROLE {APP_ROLE}
                    WITH NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE
                         NOREPLICATION LOGIN
                         PASSWORD '{pwd_escaped}';
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

    # Future tables (any later migration that creates a table while running as
    # the bootstrap superuser) auto-grant to the app role.
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {APP_ROLE}"
    )
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"GRANT USAGE, SELECT ON SEQUENCES TO {APP_ROLE}"
    )

    # alembic_version is touched only by alembic itself (which runs as the
    # bootstrap superuser). Revoke runtime write access so the app role
    # cannot tamper with migration bookkeeping.
    op.execute(
        f"REVOKE INSERT, UPDATE, DELETE ON TABLE alembic_version FROM {APP_ROLE}"
    )


def downgrade() -> None:
    # Inverse order: revoke privileges → drop role. The DROP fails if any
    # object is owned by the role (it never owns anything in our setup,
    # but the IF EXISTS guard keeps the downgrade idempotent).
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
