"""Orphan sweep must not delete chemistry rows other callers still use.

The pre-fix sweep was inline SQL:

    DELETE FROM substances
     WHERE id NOT IN (SELECT substance_id FROM extraction_substances)

Under RLS that subquery only returns the *caller's* join rows, so the
statement deleted every substance the caller did not reference and the FK
cascade took the owning join rows with it. A caller with an empty scope
truncated the whole pool.

Two things have to be true for the failure to be reproducible here, and
neither holds by default in the unit suite:

* The schema needs the isolation policies. ``Base.metadata.create_all``
  (tests/conftest.py) creates tables only — RLS is enabled and policed by
  the ``f1a2b3c4d5e6`` migration. ``_enable_rls`` applies the same
  ENABLE + policy DDL, and Postgres DDL is transactional, so it rolls back
  with the test.
* The caller must not bypass RLS. The test DB connects as a superuser, so
  ``_enter_restricted_role`` switches to a throwaway NOBYPASSRLS role.

With both in place these tests genuinely fail against the pre-fix inline
sweep — either the assertion trips (old FK) or the delete raises a
foreign-key violation (current FK guardrail).
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.orm import Extraction, ExtractionSubstance, Substance
from app.services.orphan_sweep import sweep_orphan_chem_rows

pytestmark = pytest.mark.asyncio

SID_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
SID_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"

# Minimal non-BYPASSRLS role. Created per test and dropped with the
# transaction's SET LOCAL ROLE; the role itself is cluster-wide so the name
# is fixed and creation is guarded.
_RESTRICTED_ROLE = "bchemxtract_rls_probe"

# The three RLS-scoped tables, and the policy the f1a2b3c4d5e6 migration
# puts on each. Kept verbatim so the test exercises production semantics.
_RLS_TABLES = ("extractions", "extraction_substances", "extraction_reactions")
_ISOLATION_POLICY = """
    CREATE POLICY {table}_isolation ON {table}
    USING (
        session_id = NULLIF(current_setting('app.session_id', true), '')
        OR api_key_hash =
            NULLIF(current_setting('app.api_key_hash', true), '')::bytea
    )
"""


async def _enable_rls(db) -> None:
    """Apply the production isolation policies for this transaction only.

    create_all builds tables without RLS, so without this the restricted
    role below would still see every row and the sweep bug would not
    reproduce. DDL is transactional in Postgres — the policies disappear
    when the test's transaction rolls back.
    """
    for table in _RLS_TABLES:
        await db.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
        await db.execute(text(_ISOLATION_POLICY.format(table=table)))


async def _enter_restricted_role(db, session_id: str) -> None:
    """Make RLS enforceable for the rest of this transaction.

    Creates (once) a plain NOBYPASSRLS role, grants it the runtime CRUD
    privileges plus EXECUTE on the sweep function, then SET LOCAL ROLE +
    the RLS GUC so reads and writes behave exactly like a scoped request.
    """
    await db.execute(
        text(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{_RESTRICTED_ROLE}')
            THEN
                CREATE ROLE {_RESTRICTED_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS;
            END IF;
        END $$;
        """)
    )
    await db.execute(text(f"GRANT USAGE ON SCHEMA public TO {_RESTRICTED_ROLE}"))
    await db.execute(
        text(
            "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public "
            f"TO {_RESTRICTED_ROLE}"
        )
    )
    await db.execute(
        text(
            "GRANT EXECUTE ON FUNCTION public.sweep_orphan_chem_rows() "
            f"TO {_RESTRICTED_ROLE}"
        )
    )
    await db.execute(
        text("SELECT set_config('app.session_id', :sid, true)"), {"sid": session_id}
    )
    await db.execute(text(f"SET LOCAL ROLE {_RESTRICTED_ROLE}"))


async def _seed_linked_substance(db, session_id: str) -> tuple[int, int]:
    """Insert one extraction owned by ``session_id`` plus a linked substance.

    Returns ``(extraction_id, substance_id)``. Runs as the connected
    superuser, before any SET LOCAL ROLE, so the seed is not itself subject
    to the policies under test.
    """
    await db.execute(
        text("SELECT set_config('app.session_id', :sid, true)"), {"sid": session_id}
    )
    extraction = Extraction(
        session_id=session_id,
        api_key_hash=None,
        filename=f"sweep-{session_id[:8]}.cdx",
        file_size=10,
        format="cdx",
        structure_count=1,
        extraction_time_ms=0.0,
        warnings=[],
    )
    db.add(extraction)
    await db.flush()

    substance = Substance(
        dedup_key=f"SWEEP{uuid.uuid4().hex[:9].upper()}-AAAAAAAAAA-N",
        inchi_key="",
        inchi="",
        smiles="CCO",
        extended_smiles="CCO",
        molecular_formula="C2H6O",
        svg="",
        svg_cdx="",
        mdlv3000="",
    )
    db.add(substance)
    await db.flush()

    db.add(
        ExtractionSubstance(
            extraction_id=extraction.id,
            substance_id=substance.id,
            position=0,
            occurrences=[],
            session_id=session_id,
            api_key_hash=None,
        )
    )
    await db.flush()
    return extraction.id, substance.id


async def _orphan_substance(db) -> int:
    """Insert a substance linked to nothing. Returns its id."""
    substance = Substance(
        dedup_key=f"ORPHN{uuid.uuid4().hex[:9].upper()}-AAAAAAAAAA-N",
        inchi_key="",
        inchi="",
        smiles="CC",
        extended_smiles="CC",
        molecular_formula="C2H6",
        svg="",
        svg_cdx="",
        mdlv3000="",
    )
    db.add(substance)
    await db.flush()
    return substance.id


async def _exists(db, substance_id: int) -> bool:
    """True if the substance row is still present (bypassing RLS)."""
    found = await db.scalar(
        text("SELECT 1 FROM substances WHERE id = :sid"), {"sid": substance_id}
    )
    return found is not None


async def test_sweep_keeps_rows_owned_by_another_session(db_session):
    """Session B's sweep must not touch session A's substances.

    This is the production incident: B deletes its own data, the sweep's
    reference check sees only B's join rows, and A's structures vanish.
    """
    _, subst_a = await _seed_linked_substance(db_session, SID_A)
    extraction_b, subst_b = await _seed_linked_substance(db_session, SID_B)

    # Act as session B, with RLS actually enforced, and delete B's own
    # extraction — the exact shape of DELETE /api/history/{id}.
    await _enable_rls(db_session)
    await _enter_restricted_role(db_session, SID_B)
    await db_session.execute(
        text("DELETE FROM extractions WHERE id = :eid"), {"eid": extraction_b}
    )
    await sweep_orphan_chem_rows(db_session)
    await db_session.execute(text("RESET ROLE"))

    assert await _exists(db_session, subst_a), (
        "session A's substance was deleted by session B's orphan sweep"
    )
    assert not await _exists(db_session, subst_b), (
        "session B's own substance is unreferenced now and should be swept"
    )


async def test_sweep_deletes_genuinely_unreferenced_rows(db_session):
    """The sweep still reclaims rows nothing points at."""
    orphan = await _orphan_substance(db_session)
    _, linked = await _seed_linked_substance(db_session, SID_A)

    await sweep_orphan_chem_rows(db_session)

    assert not await _exists(db_session, orphan)
    assert await _exists(db_session, linked)


async def test_sweep_survives_empty_rls_scope(db_session):
    """An unscoped caller must not be able to truncate the pool.

    With no ``app.session_id`` set, the old subquery returned zero rows and
    ``NOT IN ()`` matched everything.
    """
    _, subst_a = await _seed_linked_substance(db_session, SID_A)

    await _enable_rls(db_session)
    await _enter_restricted_role(db_session, "")
    await sweep_orphan_chem_rows(db_session)
    await db_session.execute(text("RESET ROLE"))

    assert await _exists(db_session, subst_a)


async def test_referenced_substance_cannot_be_deleted(db_session):
    """FK guardrail: deleting a referenced substance raises, not cascades.

    Backstop for any future code path that deletes from the pool directly —
    it fails loudly instead of silently shredding join rows.
    """
    _, substance_id = await _seed_linked_substance(db_session, SID_A)

    with pytest.raises(IntegrityError):
        await db_session.execute(
            text("DELETE FROM substances WHERE id = :sid"), {"sid": substance_id}
        )
