"""PRIV-02 recovery-code restore tests (Wave 0 RED → green on 11-03).

Covers D-09 semantics:
- Valid UUID4 swaps the cookie to the pasted value (Set-Cookie no-merge).
- Invalid UUID4 format returns 422 (Pydantic field_validator rejects it).
- Restore is no-merge: the browser's PRIOR anonymous session_id's data
  remains in the DB but is unreachable from the restored cookie scope.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.models.orm import Extraction
from app.services.db import AsyncSessionLocal

pytestmark = pytest.mark.asyncio


VALID_UUID4 = "33333333-3333-4333-8333-333333333333"
ANOTHER_VALID_UUID4 = "44444444-4444-4444-8444-444444444444"


async def _seed_extraction(session_id: str) -> int:
    async with AsyncSessionLocal() as db:
        await db.execute(
            text("SELECT set_config('app.session_id', :sid, true)"),
            {"sid": session_id},
        )
        row = Extraction(
            session_id=session_id,
            api_key_hash=None,
            filename="recovery.cdx",
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


async def test_restore_swaps_cookie_returns_204(started_app):
    """POST /api/auth/restore with valid UUID4 returns 204 and swaps the
    bcx_sid cookie to the pasted value (Set-Cookie header confirms).
    """
    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Start with a stale cookie or no cookie — restore is idempotent.
        resp = await ac.post("/api/auth/restore", json={"code": VALID_UUID4})
        assert resp.status_code == 204, resp.text
        set_cookie = resp.headers.get("set-cookie", "")
        assert "bcx_sid" in set_cookie
        assert VALID_UUID4 in set_cookie
        assert ac.cookies.get("bcx_sid") == VALID_UUID4


async def test_restore_invalid_uuid_returns_422(started_app):
    """Pydantic validator on RestoreRequest rejects malformed input."""
    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        for bad in ("not-a-uuid", "", "11111111-1111-3111-8111-111111111111"):
            resp = await ac.post("/api/auth/restore", json={"code": bad})
            assert resp.status_code == 422, (
                f"input {bad!r} should be 422, got {resp.status_code}: {resp.text}"
            )


async def test_restore_no_merge_semantics(started_app):
    """Restoring to UUID-A from a session that owned data under UUID-B does
    NOT merge UUID-B's rows into UUID-A's scope. UUID-B's data is still in
    the DB but is unreachable from the new cookie.
    """
    # Seed data owned by the PRIOR anonymous session (ANOTHER_VALID_UUID4).
    await _seed_extraction(ANOTHER_VALID_UUID4)

    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Browser holds the prior cookie.
        ac.cookies.set("bcx_sid", ANOTHER_VALID_UUID4)
        # User pastes a different recovery code.
        resp = await ac.post("/api/auth/restore", json={"code": VALID_UUID4})
        assert resp.status_code == 204, resp.text
        assert ac.cookies.get("bcx_sid") == VALID_UUID4

        # The prior session's row is NOT visible under the restored cookie.
        hist = await ac.get("/api/history")
        assert hist.status_code == 200, hist.text
        items = hist.json()["items"]
        assert items == [], (
            f"no-merge violated: items={items} (prior session data leaked "
            f"into restored scope)"
        )

    # Confirm the row STILL exists in the DB (not deleted, just unreachable).
    # Postgres bypass: peek with row_security disabled (test runs as the
    # superuser-equivalent `postgres` role per conftest DATABASE_URL).
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET LOCAL row_security = off"))
        result = await db.execute(
            text("SELECT session_id FROM extractions WHERE filename = 'recovery.cdx'"),
        )
        rows = [r[0] for r in result.fetchall()]
        assert ANOTHER_VALID_UUID4 in rows, (
            f"row vanished entirely — restore should be no-merge, not "
            f"delete: rows={rows}"
        )
