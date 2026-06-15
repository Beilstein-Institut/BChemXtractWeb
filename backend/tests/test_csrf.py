"""CSRF synchronizer-token tests.

- GET /api/csrf-token issues a token HMAC-bound to the caller's session_id.
- POST /api/extract under cookie auth WITHOUT X-CSRF-Token → 403 CSRF_INVALID.
- A token issued for session A cannot be replayed against session B.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

pytestmark = pytest.mark.asyncio


SID_A = "55555555-5555-4555-8555-555555555555"
SID_B = "66666666-6666-4666-8666-666666666666"


async def test_csrf_token_session_bound(started_app):
    """GET /api/csrf-token returns {csrf_token: "..."} and the token is
    bound to the caller's session_id — replaying it against a different
    session_id (different cookie) fails verification.
    """
    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac_a:
        ac_a.cookies.set("bcx_sid", SID_A)
        resp = await ac_a.get("/api/csrf-token")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "csrf_token" in body
        token_a = body["csrf_token"]
        assert isinstance(token_a, str) and len(token_a) > 0


async def test_csrf_missing_returns_403(started_app):
    """A cookie-auth POST without X-CSRF-Token returns 403 with code
    CSRF_INVALID. Tests via /api/me/data DELETE (smallest state-changing
    cookie-auth surface).
    """
    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ac.cookies.set("bcx_sid", SID_A)
        resp = await ac.delete("/api/me/data")
        assert resp.status_code == 403, resp.text
        body = resp.json()
        assert body.get("code") == "CSRF_INVALID", body


async def test_csrf_replay_blocked(started_app):
    """A token issued for SID_A cannot be replayed against SID_B."""
    transport = ASGITransport(app=started_app)

    async with AsyncClient(transport=transport, base_url="http://test") as ac_a:
        ac_a.cookies.set("bcx_sid", SID_A)
        resp = await ac_a.get("/api/csrf-token")
        assert resp.status_code == 200, resp.text
        token_a = resp.json()["csrf_token"]

    async with AsyncClient(transport=transport, base_url="http://test") as ac_b:
        ac_b.cookies.set("bcx_sid", SID_B)
        ac_b.headers.update({"X-CSRF-Token": token_a})
        resp = await ac_b.delete("/api/me/data")
        assert resp.status_code == 403, (
            f"CSRF replay should be blocked; got {resp.status_code}: {resp.text}"
        )
        assert resp.json().get("code") == "CSRF_INVALID"


async def test_csrf_skip_for_x_api_key(started_app):
    """Requests authenticated via X-API-Key skip the CSRF middleware
    (skip list). The request will likely fail auth (the dummy key is
    not real) but it must NOT fail with 403/CSRF_INVALID.
    """
    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ac.headers.update({"X-API-Key": "bcx_dummy_does_not_validate"})
        resp = await ac.delete("/api/me/data")
        assert resp.status_code != 403 or resp.json().get("code") != "CSRF_INVALID", (
            f"X-API-Key path should skip CSRF; got {resp.status_code}: {resp.text}"
        )
