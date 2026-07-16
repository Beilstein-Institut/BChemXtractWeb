"""Alembic schema + standalone canonical-smiles backfill.

After splitting schema migration from data backfill the two concerns are
tested independently:

  * ``test_upgrade_adds_schema_only``: alembic ``upgrade head`` adds the
    column + indexes but does NOT populate canonical_smiles.
  * ``test_backfill_*``: the standalone backfill command populates
    canonical_smiles, is idempotent, and leaves unparsable SMILES as
    literal NULL.

Implementation note: alembic's async env.py calls ``asyncio.run()``
internally, which deadlocks when invoked from inside a pytest-asyncio
event loop — even from ``run_in_executor``. The cleanest portable fix is
to invoke ``alembic upgrade`` via a subprocess that gets
``DATABASE_URL`` from the environment. This also exercises the exact
CLI path production deployments use.

A dedicated PostgreSQL database ``bchemxtract_alembic_test`` is dropped
and recreated fresh so migrations always start from zero state.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import psycopg
import pytest
from sqlalchemy import create_engine, text

from app.services.canonicalize_backfill import backfill_canonical_smiles

# Dedicated test DB — isolated from bchemxtract_test which is created
# via Base.metadata.create_all and already contains canonical_smiles.
ALEMBIC_TEST_DB = "bchemxtract_alembic_test"
ALEMBIC_DB_URL = (
    f"postgresql+psycopg://postgres:postgres@localhost:5432/{ALEMBIC_TEST_DB}"
)
# Sync engine URL. psycopg3 supports sync + async under the same driver
# suffix — no need to strip ``+psycopg`` (psycopg2 is not installed and
# stripping would fall back to it).
ALEMBIC_SYNC_URL = ALEMBIC_DB_URL

_BACKEND_DIR = Path(__file__).parent.parent


def _reset_alembic_db() -> None:
    """Drop and recreate the isolated alembic-backfill test database."""
    with (
        psycopg.connect(
            dbname="postgres",
            user="postgres",
            password="postgres",
            host="localhost",
            port=5432,
            autocommit=True,
        ) as conn,
        conn.cursor() as cur,
    ):
        cur.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = %s AND pid <> pg_backend_pid()",
            (ALEMBIC_TEST_DB,),
        )
        cur.execute(f'DROP DATABASE IF EXISTS "{ALEMBIC_TEST_DB}"')
        cur.execute(f'CREATE DATABASE "{ALEMBIC_TEST_DB}"')


def _run_alembic(*args: str) -> None:
    """Invoke ``alembic`` CLI against the isolated test DB."""
    result = subprocess.run(
        ["alembic", *args],
        cwd=str(_BACKEND_DIR),
        env={**os.environ, "DATABASE_URL": ALEMBIC_DB_URL},
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"alembic {' '.join(args)} failed (code={result.returncode})\n"
            f"STDOUT:\n{result.stdout}\n"
            f"STDERR:\n{result.stderr}"
        )


@pytest.fixture
def fresh_alembic_db() -> str:
    """Drop + recreate the isolated alembic test DB for this test."""
    _reset_alembic_db()
    return ALEMBIC_DB_URL


# ---------------------------------------------------------------------------
# Schema migration (pure DDL, no JVM)
# ---------------------------------------------------------------------------


def test_upgrade_adds_schema_only(fresh_alembic_db: str) -> None:
    """alembic ``upgrade head`` must add canonical_smiles + indexes and
    NOT populate data. Seeded rows keep canonical_smiles IS NULL until
    the backfill command runs explicitly."""
    # Seed at the prior revision — no canonical_smiles column yet.
    _run_alembic("upgrade", "850c00d963f1")
    sync_engine = create_engine(ALEMBIC_SYNC_URL)
    with sync_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO substances "
                "(inchi_key, smiles, inchi, extended_smiles, "
                "molecular_formula, svg, svg_cdx, mdlv3000) VALUES "
                "(:k, :s, '', '', 'C6H6', '', '', '')"
            ),
            {"k": "TESTBENZENEAAA-UHFFFAOYSA-N", "s": "C1=CC=CC=C1"},
        )
    sync_engine.dispose()

    # Upgrade to the canonical_smiles revision — DDL only.
    _run_alembic("upgrade", "head")

    sync_engine = create_engine(ALEMBIC_SYNC_URL)
    with sync_engine.begin() as conn:
        # Column exists.
        row = conn.execute(
            text("SELECT canonical_smiles FROM substances WHERE inchi_key = :k"),
            {"k": "TESTBENZENEAAA-UHFFFAOYSA-N"},
        ).first()
        # Index exists.
        indexes = conn.execute(
            text("SELECT indexname FROM pg_indexes WHERE tablename = 'substances'")
        ).fetchall()
    sync_engine.dispose()

    assert row is not None
    assert row[0] is None, (
        "schema-only migration should not populate canonical_smiles; "
        f"got {row[0]!r}. Backfill must run as a separate CLI step."
    )
    index_names = {r[0] for r in indexes}
    assert "ix_substances_canonical_smiles" in index_names
    assert "ix_substances_molecular_formula" in index_names


# ---------------------------------------------------------------------------
# Standalone backfill (JVM-backed)
# ---------------------------------------------------------------------------


def test_backfill_populates_canonical_smiles(fresh_alembic_db: str) -> None:
    """After alembic upgrade + backfill, Kekulé input becomes aromatic."""
    _run_alembic("upgrade", "head")

    sync_engine = create_engine(ALEMBIC_SYNC_URL, isolation_level="AUTOCOMMIT")
    with sync_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO substances "
                "(dedup_key, inchi_key, smiles, inchi, extended_smiles, "
                "molecular_formula, svg, svg_cdx, mdlv3000) VALUES "
                "(:k, :k, :s, '', '', 'C6H6', '', '', '')"
            ),
            {"k": "TESTBENZENEAAA-UHFFFAOYSA-N", "s": "C1=CC=CC=C1"},
        )

    with sync_engine.connect() as conn:
        result = backfill_canonical_smiles(conn, batch_size=100)

    assert result.updated == 1
    assert result.unparseable == 0

    with sync_engine.connect() as conn:
        row = conn.execute(
            text("SELECT canonical_smiles FROM substances WHERE inchi_key = :k"),
            {"k": "TESTBENZENEAAA-UHFFFAOYSA-N"},
        ).first()
    sync_engine.dispose()

    assert row is not None
    assert row[0] == "c1ccccc1", (
        f"expected canonical benzene 'c1ccccc1', got {row[0]!r}"
    )


def test_backfill_is_idempotent(fresh_alembic_db: str) -> None:
    """Re-running the backfill is a safe no-op."""
    _run_alembic("upgrade", "head")
    sync_engine = create_engine(ALEMBIC_SYNC_URL, isolation_level="AUTOCOMMIT")
    with sync_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO substances "
                "(dedup_key, inchi_key, smiles, inchi, extended_smiles, "
                "molecular_formula, svg, svg_cdx, mdlv3000) VALUES "
                "(:k, :k, :s, '', '', 'C6H6', '', '', '')"
            ),
            {"k": "TESTBENZENEAAA-UHFFFAOYSA-N", "s": "C1=CC=CC=C1"},
        )
    with sync_engine.connect() as conn:
        first = backfill_canonical_smiles(conn, batch_size=100)
        second = backfill_canonical_smiles(conn, batch_size=100)
    sync_engine.dispose()

    assert first.updated == 1
    assert second.updated == 0, "re-run must be a no-op"


def test_backfill_leaves_unparsable_as_null(fresh_alembic_db: str) -> None:
    """Unparsable SMILES rows must keep canonical_smiles IS NULL."""
    _run_alembic("upgrade", "head")
    sync_engine = create_engine(ALEMBIC_SYNC_URL, isolation_level="AUTOCOMMIT")
    with sync_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO substances "
                "(dedup_key, inchi_key, smiles, inchi, extended_smiles, "
                "molecular_formula, svg, svg_cdx, mdlv3000) VALUES "
                "(:k, :k, :s, '', '', 'X', '', '', '')"
            ),
            {
                "k": "BADSMILESKEYAA-UHFFFAOYSA-N",
                "s": "this-is-not-a-smiles-XYZ!!",
            },
        )
    with sync_engine.connect() as conn:
        result = backfill_canonical_smiles(conn, batch_size=100)

        row = conn.execute(
            text("SELECT canonical_smiles FROM substances WHERE inchi_key = :k"),
            {"k": "BADSMILESKEYAA-UHFFFAOYSA-N"},
        ).first()
    sync_engine.dispose()

    assert result.updated == 0
    assert result.unparseable == 1
    assert row is not None
    assert row[0] is None
