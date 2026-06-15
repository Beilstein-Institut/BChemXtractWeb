"""RLS cross-session isolation tests.

Verifies that the `set_rls_context` execution inside `get_scoped_db` plus the
FORCE ROW LEVEL SECURITY policies on extractions/substances/reactions actually
prevent client A from seeing client B's rows — even when a router forgets to
add a WHERE clause.

Postgres bypasses RLS for any role with rolsuper=true or rolbypassrls=true,
so these tests only enforce when connected as a non-superuser role. The
test DB is provisioned as the bootstrap postgres superuser; the conftest
sets ALLOW_SUPERUSER_DB=true to bypass the startup-probe RuntimeError.
End-to-end RLS enforcement is verified via Playwright against the
production-shape docker-compose stack where the backend connects as the
NOSUPERUSER NOBYPASSRLS bchemxtract_app role.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.models.orm import Extraction
from app.services.db import AsyncSessionLocal
from tests.conftest import skip_under_superuser_db

pytestmark = [pytest.mark.asyncio, skip_under_superuser_db]


SID_A = "11111111-1111-4111-8111-111111111111"
SID_B = "22222222-2222-4222-8222-222222222222"


async def _seed_extraction(session_id: str) -> int:
    """Insert one extraction row owned by ``session_id``.

    Sets ``app.session_id`` first so the row passes the policy WITH CHECK
    on insert. Mirrors the column shape declared on the Extraction ORM
    (including the ownership columns).
    """
    async with AsyncSessionLocal() as db:
        await db.execute(
            text("SELECT set_config('app.session_id', :sid, true)"),
            {"sid": session_id},
        )
        row = Extraction(
            session_id=session_id,
            api_key_hash=None,
            filename=f"isolation-{session_id[:8]}.cdx",
            file_size=10,
            format="cdx",
            structure_count=0,
            extraction_time_ms=0.0,
            warnings=[],
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row.id


async def test_cross_session_isolation_blocks_read(started_app):
    """Client A and Client B with different bcx_sid cookies CANNOT see each
    other's extractions via GET /api/history.
    """
    await _seed_extraction(SID_A)
    await _seed_extraction(SID_B)

    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac_a:
        ac_a.cookies.set("bcx_sid", SID_A)
        resp_a = await ac_a.get("/api/history")
        assert resp_a.status_code == 200, resp_a.text
        ids_a = {item["id"] for item in resp_a.json()["items"]}

    async with AsyncClient(transport=transport, base_url="http://test") as ac_b:
        ac_b.cookies.set("bcx_sid", SID_B)
        resp_b = await ac_b.get("/api/history")
        assert resp_b.status_code == 200, resp_b.text
        ids_b = {item["id"] for item in resp_b.json()["items"]}

    assert ids_a.isdisjoint(ids_b), (
        f"RLS leak: ids_a={ids_a} ids_b={ids_b} — overlap means a row was "
        f"visible across sessions"
    )


async def test_raw_query_under_session_a_hides_session_b_rows(started_app):
    """Direct SQL bound to client A's session context returns 0 rows when
    filtered to client B's session_id. Proves the RLS policy USING clause
    is doing the filtering, not the WHERE clause in the route handler.
    """
    sid_a = str(uuid.uuid4())
    sid_b = str(uuid.uuid4())
    await _seed_extraction(sid_a)
    eid_b = await _seed_extraction(sid_b)

    async with AsyncSessionLocal() as db:
        await db.execute(
            text("SELECT set_config('app.session_id', :sid, true)"),
            {"sid": sid_a},
        )
        # Even though we explicitly target Client B's row, RLS hides it
        # because app.session_id is set to sid_a.
        result = await db.execute(
            text("SELECT id FROM extractions WHERE id = :id"),
            {"id": eid_b},
        )
        rows = result.fetchall()
        assert rows == [], (
            f"RLS USING clause did not filter: row {eid_b} visible under "
            f"session_id={sid_a}"
        )


async def test_anonymous_client_sees_zero_rows(started_app):
    """A client with no bcx_sid cookie hits PUT /api/auth/me to mint a fresh
    cookie + session_id, then GET /api/history returns an empty list — even
    when other sessions' rows exist in the DB.
    """
    await _seed_extraction(SID_A)

    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Bootstrap a session; the response sets bcx_sid to a fresh UUID4
        # that has never owned any row.
        boot = await ac.put("/api/auth/me")
        assert boot.status_code == 200, boot.text
        assert "bcx_sid" in ac.cookies

        resp = await ac.get("/api/history")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["items"] == [], f"Fresh anonymous session saw existing rows: {body}"
