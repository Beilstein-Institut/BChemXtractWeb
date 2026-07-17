"""Admin API-key tests.

Covers:
- POST /api/admin/api-keys with X-Admin-Secret returns plaintext ONCE +
  persists PBKDF2 hash.
- validate_api_key returns None for unknown key.
- Revoked key (revoked_at != NULL) returns None even with correct plaintext.
- lru_cache warm vs cold: warm path is dramatically faster.
"""

from __future__ import annotations

import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.models.orm import ApiKey
from app.services.db import AsyncSessionLocal

pytestmark = pytest.mark.asyncio


def _admin_headers() -> dict:
    return {"X-Admin-Secret": os.environ["ADMIN_SECRET"]}


async def test_admin_create_returns_plaintext_once(started_app):
    """POST /api/admin/api-keys returns the plaintext key. The persisted
    `key_hash` is the PBKDF2 hash, NOT the plaintext.
    """
    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/admin/api-keys",
            headers=_admin_headers(),
            json={"name": "ci-test", "description": "", "expiry_days": 90},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        plaintext = body["key"]
        assert plaintext.startswith("bcx_"), plaintext
        # base64url(32) is 43 characters → prefix 4 + body 43 = 47.
        assert len(plaintext) == 4 + 43, len(plaintext)

        async with AsyncSessionLocal() as db:
            row = await db.scalar(select(ApiKey).where(ApiKey.id == body["key_id"]))
            assert row is not None
            assert row.key_hash != plaintext.encode()
            assert len(row.key_hash) == 32, len(row.key_hash)


async def test_validate_api_key_unknown_returns_none():
    """An unrecognized key returns None — never raises."""
    from app.core.security import validate_api_key

    async with AsyncSessionLocal() as db:
        result = await validate_api_key("bcx_definitely_not_a_real_key", db)
        assert result is None


async def test_revoked_key_returns_401(started_app):
    """Revoked key (revoked_at != NULL) fails validation even with correct
    plaintext.
    """
    from app.core.security import validate_api_key

    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/admin/api-keys",
            headers=_admin_headers(),
            json={"name": "to-revoke", "expiry_days": 90},
        )
        assert resp.status_code == 201, resp.text
        plaintext = resp.json()["key"]
        key_id = resp.json()["key_id"]

        async with AsyncSessionLocal() as db:
            row = await validate_api_key(plaintext, db)
            assert row is not None and row.id == key_id

        revoke = await ac.delete(
            f"/api/admin/api-keys/{key_id}",
            headers=_admin_headers(),
        )
        assert revoke.status_code == 204, revoke.text

        async with AsyncSessionLocal() as db:
            row = await validate_api_key(plaintext, db)
            assert row is None


async def test_lru_cache_warm_vs_cold(started_app):
    """hash_api_key_for_lookup runs PBKDF2 (600k iters); lru_cache memoises it
    so validating the same key twice recomputes the hash only once. Assert the
    cache's hit/miss counters directly -- wall-clock timing was too flaky on
    shared CI runners.
    """
    from app.core.security import hash_api_key_for_lookup, validate_api_key

    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/admin/api-keys",
            headers=_admin_headers(),
            json={"name": "perf", "expiry_days": 0},
        )
        assert resp.status_code == 201, resp.text
        plaintext = resp.json()["key"]

        hash_api_key_for_lookup.cache_clear()

        async with AsyncSessionLocal() as db:
            await validate_api_key(plaintext, db)
        cold = hash_api_key_for_lookup.cache_info()
        assert (cold.misses, cold.hits) == (1, 0), f"expected cold miss: {cold}"

        async with AsyncSessionLocal() as db:
            await validate_api_key(plaintext, db)
        warm = hash_api_key_for_lookup.cache_info()
        assert (warm.misses, warm.hits) == (1, 1), f"lru_cache not effective: {warm}"
