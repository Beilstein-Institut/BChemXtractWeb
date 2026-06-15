"""Audit-log tests.

Covers:
- auth.session.created emitted after first PUT /api/auth/me with no cookie.
- auth.api_key.used.first emitted EXACTLY once per key (idempotent).
- session_id_hash is sha256(session_id) — never the raw UUID.
- Background-task audit insert does NOT block the user response.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import time

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.models.orm import AuditLog
from app.services.db import AsyncSessionLocal

pytestmark = pytest.mark.asyncio


async def _audit_count(event: str) -> int:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(func.count(AuditLog.id)).where(AuditLog.event == event)
        )
        return int(result.scalar_one())


async def _wait_for_audit(event: str, expected: int, timeout: float = 2.0) -> int:
    """Background tasks fire after the response. Poll up to `timeout`s."""
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        n = await _audit_count(event)
        if n >= expected:
            return n
        await asyncio.sleep(0.05)
    return await _audit_count(event)


async def test_session_created_event_on_first_put_me(started_app):
    """First PUT /api/auth/me with no cookie mints a session AND emits
    `auth.session.created` to audit_log (background task, polled).
    """
    n_before = await _audit_count("auth.session.created")

    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.put("/api/auth/me")
        assert resp.status_code == 200, resp.text

    n_after = await _wait_for_audit("auth.session.created", n_before + 1)
    assert n_after == n_before + 1, (
        f"expected exactly one new auth.session.created row, "
        f"got delta {n_after - n_before}"
    )


async def test_api_key_first_use_emits_once(started_app):
    """`auth.api_key.used.first` emits EXACTLY once per key — second use of
    the same key does NOT emit again.
    """
    admin = {"X-Admin-Secret": os.environ["ADMIN_SECRET"]}
    transport = ASGITransport(app=started_app)

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create = await ac.post(
            "/api/admin/api-keys",
            headers=admin,
            json={"name": "first-use", "expiry_days": 0},
        )
        assert create.status_code == 201, create.text
        plaintext = create.json()["key"]
        key_id = create.json()["key_id"]

        n_before = await _audit_count("auth.api_key.used.first")

        resp1 = await ac.get(
            "/api/history",
            headers={"X-API-Key": plaintext},
        )
        assert resp1.status_code == 200, resp1.text

        await _wait_for_audit("auth.api_key.used.first", n_before + 1)

        resp2 = await ac.get(
            "/api/history",
            headers={"X-API-Key": plaintext},
        )
        assert resp2.status_code == 200, resp2.text
        await asyncio.sleep(0.2)

        n_after = await _audit_count("auth.api_key.used.first")
        assert n_after == n_before + 1, (
            f"auth.api_key.used.first emitted {n_after - n_before} times "
            f"for key_id={key_id}; expected exactly 1"
        )


async def test_session_id_hash_is_sha256_not_raw(started_app):
    """audit_log.session_id_hash stores sha256(session_id) bytes (32 bytes),
    NEVER the raw UUID string.
    """
    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.put("/api/auth/me")
        assert resp.status_code == 200, resp.text
        sid = resp.json()["session_id"]
        expected = hashlib.sha256(sid.encode()).digest()

    await _wait_for_audit("auth.session.created", 1)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AuditLog)
            .where(AuditLog.event == "auth.session.created")
            .order_by(AuditLog.at.desc())
            .limit(1)
        )
        row = result.scalar_one()
        assert len(row.session_id_hash) == 32, len(row.session_id_hash)
        assert row.session_id_hash == expected, (
            f"session_id_hash mismatch — expected sha256({sid}) but stored "
            f"bytes differ. Either raw UUID was stored or a different hash "
            f"function is in use."
        )


async def test_audit_does_not_block_response(started_app, monkeypatch):
    """Routine audit inserts use BackgroundTasks. The user response must
    return promptly even if the audit insert is artificially delayed.
    """
    from app.services import audit as audit_module

    real_insert = audit_module.audit_log_insert

    async def slow_insert(*args, **kwargs):
        await asyncio.sleep(0.5)
        return await real_insert(*args, **kwargs)

    monkeypatch.setattr(audit_module, "audit_log_insert", slow_insert)

    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        t0 = time.perf_counter()
        resp = await ac.put("/api/auth/me")
        elapsed = time.perf_counter() - t0
        assert resp.status_code == 200, resp.text
        assert elapsed < 0.4, (
            f"PUT /api/auth/me blocked on background audit: "
            f"elapsed={elapsed * 1000:.0f}ms (should be < 400ms)"
        )
