"""D-05: Alembic migration + JVM-backed backfill.

These tests verify revision ``c3d4e5f6a7b8`` end-to-end:

  1. ``upgrade()`` adds the column + indexes and populates canonical_smiles
     for rows with non-empty ``smiles`` via CDK.
  2. Running ``upgrade()`` twice is a no-op (idempotent — alembic revision
     table tracks completion; ``WHERE canonical_smiles IS NULL`` predicate
     skips already-processed rows).
  3. Rows whose ``smiles`` can't be parsed by CDK stay literal SQL NULL
     (not empty string) per threat model T-09-02-07.

Implementation note: alembic's async env.py calls ``asyncio.run()``
internally, which deadlocks when invoked from inside a pytest-asyncio
event loop — even from ``run_in_executor``. The cleanest portable fix
is to invoke ``alembic upgrade`` via a subprocess that gets
``DATABASE_URL`` from the environment (pydantic-settings loads it). This
also exercises the exact CLI path production deployments use.

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

# Dedicated test DB — isolated from bchemxtract_test which is created via
# Base.metadata.create_all and already contains canonical_smiles.
ALEMBIC_TEST_DB = "bchemxtract_alembic_test"
ALEMBIC_DB_URL = (
    f"postgresql+psycopg://postgres:postgres@localhost:5432/{ALEMBIC_TEST_DB}"
)

_BACKEND_DIR = Path(__file__).parent.parent


def _reset_alembic_db() -> None:
    """Drop and recreate the isolated alembic-backfill test database.

    Uses the postgres-admin connection because you can't drop a DB you're
    connected to. Runs with autocommit so DROP/CREATE aren't wrapped in a
    transaction.
    """
    with psycopg.connect(
        dbname="postgres",
        user="postgres",
        password="postgres",
        host="localhost",
        port=5432,
        autocommit=True,
    ) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = %s AND pid <> pg_backend_pid()",
            (ALEMBIC_TEST_DB,),
        )
        cur.execute(f'DROP DATABASE IF EXISTS "{ALEMBIC_TEST_DB}"')
        cur.execute(f'CREATE DATABASE "{ALEMBIC_TEST_DB}"')


def _run_alembic(*args: str) -> None:
    """Invoke ``alembic`` CLI against the isolated test DB.

    Sets ``DATABASE_URL`` in the subprocess env so ``app.config.Settings``
    picks it up and env.py routes to the isolated DB.

    Runs with ``check=True`` so a migration failure surfaces as a pytest
    error with the full subprocess stderr in the traceback.
    """
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
    """Drop + recreate the isolated alembic test DB for this test function.

    Yields the connection URL so the test can seed rows and assert state.
    """
    _reset_alembic_db()
    return ALEMBIC_DB_URL


def test_backfill_populates_canonical_smiles(fresh_alembic_db: str) -> None:
    """Upgrading with seeded Kekulé smiles populates canonical_smiles.

    Flow mirrors a real deployment migrating from the prior revision
    (``850c00d963f1``) up to ``c3d4e5f6a7b8``: seed the row first, then
    run the migration, then confirm the backfill fired.
    """
    # Step 1: upgrade to the revision BEFORE ours so the table exists
    # without canonical_smiles.
    _run_alembic("upgrade", "850c00d963f1")

    # Step 2: seed a row with Kekulé benzene via raw SQL.
    sync_engine = create_engine(fresh_alembic_db)
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

    # Step 3: now run the full upgrade → c3d4e5f6a7b8 (includes backfill).
    _run_alembic("upgrade", "head")

    # Step 4: assert the backfill populated canonical_smiles and aromaticity
    # perception converted Kekulé → aromatic.
    sync_engine = create_engine(fresh_alembic_db)
    with sync_engine.begin() as conn:
        row = conn.execute(
            text(
                "SELECT canonical_smiles FROM substances "
                "WHERE inchi_key = :k"
            ),
            {"k": "TESTBENZENEAAA-UHFFFAOYSA-N"},
        ).first()
    sync_engine.dispose()

    assert row is not None
    assert row[0] is not None and row[0] != "", (
        f"expected canonical_smiles populated, got {row[0]!r}"
    )
    # Aromaticity perception in canonicalize.py converts Kekulé → aromatic.
    assert row[0] == "c1ccccc1", (
        f"expected canonical benzene 'c1ccccc1', got {row[0]!r}"
    )


def test_backfill_is_idempotent(fresh_alembic_db: str) -> None:
    """Running upgrade twice is safe — second run is a no-op on backfill.

    The alembic revision table already tracks completion, and the
    ``WHERE canonical_smiles IS NULL`` predicate means the backfill loop
    finishes immediately on the second pass. Both invocations must
    return exit code 0.
    """
    _run_alembic("upgrade", "head")
    # Second call must not raise.
    _run_alembic("upgrade", "head")


def test_backfill_leaves_unparsable_as_null(fresh_alembic_db: str) -> None:
    """A row with garbage SMILES keeps canonical_smiles IS NULL after backfill.

    TIGHTENED per fix #9: must be literal SQL NULL, not empty string.
    The migration's ``if canon:`` guard must never fire the UPDATE with
    an empty result.
    """
    # Upgrade to revision before ours (no canonical_smiles column yet).
    _run_alembic("upgrade", "850c00d963f1")

    # Seed a row with unparsable SMILES.
    sync_engine = create_engine(fresh_alembic_db)
    with sync_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO substances "
                "(inchi_key, smiles, inchi, extended_smiles, "
                "molecular_formula, svg, svg_cdx, mdlv3000) VALUES "
                "(:k, :s, '', '', 'X', '', '', '')"
            ),
            {
                "k": "BADSMILESKEYAA-UHFFFAOYSA-N",
                "s": "this-is-not-a-smiles-XYZ!!",
            },
        )
    sync_engine.dispose()

    # Run the full migration → c3d4e5f6a7b8 (includes backfill).
    _run_alembic("upgrade", "head")

    # Verify the unparsable row kept NULL (not empty string).
    sync_engine = create_engine(fresh_alembic_db)
    with sync_engine.begin() as conn:
        row = conn.execute(
            text(
                "SELECT canonical_smiles FROM substances "
                "WHERE inchi_key = :k"
            ),
            {"k": "BADSMILESKEYAA-UHFFFAOYSA-N"},
        ).first()
    sync_engine.dispose()

    assert row is not None
    # TIGHTENED assertion per fix #9: literal SQL NULL, not empty string.
    assert row[0] is None, (
        f"expected canonical_smiles IS NULL for unparsable SMILES, "
        f"got {row[0]!r} (empty string would indicate the guard failed)"
    )
