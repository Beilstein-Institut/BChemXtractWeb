"""Regression: RLS GUCs (`app.session_id`, `app.api_key_hash`) must survive
COMMIT boundaries inside a single AsyncSession.

Background
----------
``set_rls_context`` issues ``set_config(name, value, true)`` — the trailing
``true`` makes the GUC *transaction-local*, so it dies at COMMIT. Any
SQLAlchemy ORM operation that emits an implicit BEGIN after a commit (the
canonical example is ``await db.refresh(extraction)`` immediately after
``await db.commit()`` in ``save_extraction``) runs with an empty GUC. Under
the production ``bchemxtract_app`` role (NOSUPERUSER NOBYPASSRLS), the RLS
``USING`` clause evaluates ``current_setting('app.session_id', true)`` to NULL
and rejects every row → ``refresh()`` raises ``InvalidRequestError: Could
not refresh instance`` → the route handler's ``except Exception`` swallows
the failure and returns ``extraction_id: null`` even though the row was
committed. The SPA then can't navigate to the results view.

These tests probe the GUC *lifecycle* directly via ``current_setting``,
which is independent of the RLS policy USING clause. That makes them
useful under both the prod role and the test harness's bootstrap
superuser (where RLS is bypassed entirely) — without them, the bug only
surfaces in Playwright against the docker-compose stack.

Note: ``AsyncSession.info`` is a property that returns the underlying sync
``Session.info`` dict (SQLAlchemy 2.0). The ``after_begin`` event listener
in ``app.services.db`` reads from that dict and re-emits the two
``set_config`` calls at the start of every new transaction.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text

from app.services.db import AsyncSessionLocal

pytestmark = pytest.mark.asyncio


SID = "33333333-3333-4333-8333-333333333333"
AKH_HEX = "ab" * 32  # 32-byte api_key_hash placeholder


async def test_session_id_guc_survives_commit_boundary() -> None:
    """app.session_id must remain set after COMMIT for a scoped session.

    Before the fix this asserts ``current_setting`` returns ``''`` (the
    transaction-local GUC died at COMMIT). After the fix the
    ``after_begin`` event listener re-applies the GUC on every BEGIN.
    """
    async with AsyncSessionLocal() as session:
        session.info["rls_scope"] = (SID, None)

        # First transaction — implicit BEGIN on this SELECT. The
        # after_begin listener fires and applies the GUC.
        first = await session.execute(
            text("SELECT current_setting('app.session_id', true)")
        )
        assert first.scalar() == SID, "GUC missing on first BEGIN"

        # End the transaction. The transaction-local GUC dies here.
        await session.commit()

        # Second transaction — fresh implicit BEGIN. Without the
        # listener, current_setting would now return '' (GUC unset).
        second = await session.execute(
            text("SELECT current_setting('app.session_id', true)")
        )
        assert second.scalar() == SID, (
            "GUC was lost after COMMIT — after_begin listener did not "
            "re-apply app.session_id on the post-commit BEGIN"
        )


async def test_api_key_hash_guc_survives_commit_boundary() -> None:
    """app.api_key_hash must round-trip across COMMIT for the API key path.

    Mirrors ``test_session_id_guc_survives_commit_boundary`` for the
    api-key scope (cookie session_id is None, api_key_hash carries the
    identity). The GUC stores the bytea as a hex string so the policy's
    ``NULLIF(..., '')::bytea`` cast can rebuild it.
    """
    api_key_hash = bytes.fromhex(AKH_HEX)
    async with AsyncSessionLocal() as session:
        session.info["rls_scope"] = (None, api_key_hash)

        first = await session.execute(
            text("SELECT current_setting('app.api_key_hash', true)")
        )
        assert first.scalar() == AKH_HEX, "API-key GUC missing on first BEGIN"

        await session.commit()

        second = await session.execute(
            text("SELECT current_setting('app.api_key_hash', true)")
        )
        assert second.scalar() == AKH_HEX, (
            "API-key GUC was lost after COMMIT — after_begin listener "
            "did not re-apply app.api_key_hash on the post-commit BEGIN"
        )


async def test_session_without_rls_scope_is_unaffected() -> None:
    """Sessions that never stash ``rls_scope`` in ``info`` must stay opt-out.

    Celery workers, migrations, and ad-hoc unit-test sessions all open
    bare ``AsyncSession`` instances via ``get_db`` (or ``AsyncSessionLocal``
    directly). The listener must early-return for them so they don't
    accidentally pick up a GUC bound to an unrelated request — and so
    they keep matching the legacy NO-OP behaviour.

    Postgres detail: once any code has called ``set_config`` on a custom
    GUC on a given connection, ``current_setting('name', true)`` on that
    connection returns ``''`` (empty string) instead of NULL for the
    *unset* state — the parameter is registered with the connection
    session. Both empty-string and NULL are equivalent for our RLS
    policy (``NULLIF(current_setting(...), '')`` collapses both to NULL),
    so the security invariant we care about is "no real scope leaks
    through". The assertion accepts both representations.
    """
    async with AsyncSessionLocal() as session:
        # No session.info["rls_scope"] set — the listener should no-op.
        result = await session.execute(
            text("SELECT current_setting('app.session_id', true)")
        )
        # NULL (None) on a never-touched connection, '' on a pooled
        # connection that previously hosted a scoped session.
        assert result.scalar() in (None, ""), (
            "Bare session unexpectedly has app.session_id set to a real "
            "value — the listener may be leaking scope from another "
            "session into a bare session"
        )


async def test_guc_clears_when_session_closes() -> None:
    """When the AsyncSession's connection returns to the pool, the GUC
    must NOT leak as a real value into the next session that picks up
    that connection.

    ``set_config(..., true)`` is transaction-local, so the GUC dies at
    the implicit ROLLBACK that fires when the session is closed without
    an outstanding commit. This proves we don't need to manually RESET.

    See the docstring of ``test_session_without_rls_scope_is_unaffected``
    for why the cleared state can appear as ``''`` rather than NULL on a
    recycled connection — both satisfy the policy's NULLIF collapse.
    """
    # First session: set GUC, then close WITHOUT commit (implicit rollback).
    async with AsyncSessionLocal() as s1:
        s1.info["rls_scope"] = (SID, None)
        result = await s1.execute(
            text("SELECT current_setting('app.session_id', true)")
        )
        assert result.scalar() == SID

    # Second session: opens a fresh or recycled connection. No rls_scope
    # set → listener no-ops → GUC must be unset (NULL or '').
    async with AsyncSessionLocal() as s2:
        result = await s2.execute(
            text("SELECT current_setting('app.session_id', true)")
        )
        assert result.scalar() in (None, ""), (
            "GUC leaked a real value from a prior session — "
            "transaction-local set_config should have died at the "
            "session's ROLLBACK"
        )
