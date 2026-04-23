"""Authentication tests for bearer-token API-key middleware (C-02).

Covers the :func:`app.middleware.auth.require_api_key` dependency:

- Missing ``Authorization`` header → 401 + WWW-Authenticate challenge
- Malformed header (wrong scheme) → 401
- Wrong bearer token → 401
- Valid bearer token → 200 (calls through to the real endpoint)
- Public ``/api/health`` remains accessible with no credentials
- ``/api/health/detail`` requires credentials
- Constant-time comparison via :func:`hmac.compare_digest` — covered
  indirectly by asserting the dependency rejects a wrong-length key
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import TEST_API_KEY, TEST_AUTH_HEADERS

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Missing / malformed Authorization header
# ---------------------------------------------------------------------------


async def test_missing_authorization_header_returns_401(
    unauth_client: AsyncClient,
) -> None:
    r = await unauth_client.get("/api/history")
    assert r.status_code == 401
    body = r.json()
    assert body["code"] == "UNAUTHENTICATED"
    assert "Authorization" in body["detail"]
    assert r.headers.get("www-authenticate", "").lower().startswith("bearer")


async def test_non_bearer_scheme_returns_401(
    unauth_client: AsyncClient,
) -> None:
    r = await unauth_client.get(
        "/api/history", headers={"Authorization": "Basic dXNlcjpwYXNz"}
    )
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHENTICATED"


async def test_bearer_without_value_returns_401(
    unauth_client: AsyncClient,
) -> None:
    r = await unauth_client.get("/api/history", headers={"Authorization": "Bearer"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Invalid bearer token
# ---------------------------------------------------------------------------


async def test_invalid_bearer_token_returns_401(
    unauth_client: AsyncClient,
) -> None:
    r = await unauth_client.get(
        "/api/history",
        headers={"Authorization": "Bearer not-a-valid-key-at-all"},
    )
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHENTICATED"
    # RFC 6750: invalid_token error hint in WWW-Authenticate
    challenge = r.headers.get("www-authenticate", "").lower()
    assert "invalid_token" in challenge


async def test_wrong_length_bearer_rejected(
    unauth_client: AsyncClient,
) -> None:
    """Constant-time compare still correctly rejects differently-sized keys."""
    r = await unauth_client.get("/api/history", headers={"Authorization": "Bearer x"})
    assert r.status_code == 401


async def test_prefix_of_valid_key_rejected(
    unauth_client: AsyncClient,
) -> None:
    """A prefix of the real key (length shorter) must not authenticate."""
    r = await unauth_client.get(
        "/api/history",
        headers={"Authorization": f"Bearer {TEST_API_KEY[:10]}"},
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Valid bearer token → 200 on a real route
# ---------------------------------------------------------------------------


async def test_valid_bearer_token_accepted(
    unauth_client: AsyncClient,
) -> None:
    r = await unauth_client.get("/api/history", headers=TEST_AUTH_HEADERS)
    # /api/history may 200 with empty list, or 500 without DB — but it
    # must NOT be 401.
    assert r.status_code != 401


# ---------------------------------------------------------------------------
# /api/health (public) stays accessible without credentials
# ---------------------------------------------------------------------------


async def test_health_root_is_public(unauth_client: AsyncClient) -> None:
    r = await unauth_client.get("/api/health")
    assert r.status_code == 200


async def test_health_detail_requires_auth(
    unauth_client: AsyncClient,
) -> None:
    r = await unauth_client.get("/api/health/detail")
    assert r.status_code == 401


async def test_health_detail_accessible_with_key(
    unauth_client: AsyncClient,
) -> None:
    r = await unauth_client.get("/api/health/detail", headers=TEST_AUTH_HEADERS)
    # With JVM lifecycle not started here (unauth_client uses the app
    # without LifespanManager), response may be 200 "degraded" or 500.
    # The critical assertion is "not 401".
    assert r.status_code != 401


# Settings-validator tests (sync) live in tests/test_config.py because
# the module-level ``pytest.mark.asyncio`` here would otherwise coerce
# them into coroutines.
