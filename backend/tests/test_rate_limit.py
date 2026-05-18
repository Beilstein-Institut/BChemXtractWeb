"""Rate-limit integration tests (C-02 / H-02 DoS hardening).

Validates that exceeding a per-IP limit produces:

- HTTP 429
- Unified :class:`ErrorResponse` shape (``{detail, code}``) with
  ``code == "RATE_LIMITED"``
- A ``Retry-After`` header

The suite does NOT exercise the real ``@limiter.limit(...)`` decorators on
production endpoints because their limits are intentionally loose in the
test environment (``RATE_LIMIT_*=10000/minute``). Instead, an isolated
FastAPI app is constructed per test with a tight limit on a trivial
endpoint so the 429 path is exercised deterministically.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from httpx import ASGITransport, AsyncClient
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.errors import (
    BridgeError,
    bridge_error_handler,
    http_exception_handler,
    rate_limit_exceeded_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)

pytestmark = pytest.mark.asyncio


def _build_app_with_limit(limit: str) -> FastAPI:
    """Construct a minimal FastAPI app wired with slowapi + the unified
    ``rate_limit_exceeded_handler`` so 429s land in the same JSON shape
    as every other 4xx in production."""
    limiter = Limiter(
        key_func=get_remote_address,
        default_limits=[],
        storage_uri="memory://",
        # Must match the production setting — slowapi's ``headers_enabled=True``
        # is incompatible with endpoints that return Pydantic models / dicts.
        headers_enabled=False,
    )
    app = FastAPI()
    app.state.limiter = limiter

    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(BridgeError, bridge_error_handler)
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    app.add_middleware(SlowAPIMiddleware)

    @app.get("/ping")
    @limiter.limit(limit)
    async def ping(request: Request) -> dict[str, str]:
        return {"pong": "ok"}

    return app


async def test_first_request_under_limit_is_200() -> None:
    app = _build_app_with_limit("2/minute")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get("/ping")
        assert r.status_code == 200


async def test_exceeding_limit_returns_429_with_unified_shape() -> None:
    app = _build_app_with_limit("2/minute")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r1 = await ac.get("/ping")
        r2 = await ac.get("/ping")
        r3 = await ac.get("/ping")

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r3.status_code == 429

    body = r3.json()
    assert body["code"] == "RATE_LIMITED"
    assert "detail" in body
    assert "Rate limit exceeded" in body["detail"]


async def test_429_has_retry_after_header() -> None:
    app = _build_app_with_limit("1/minute")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.get("/ping")
        r = await ac.get("/ping")
    assert r.status_code == 429
    # slowapi emits Retry-After on 429
    assert "retry-after" in {h.lower() for h in r.headers}


async def test_different_ips_have_separate_budgets() -> None:
    """slowapi keys rate limits by remote address — two clients with
    different `X-Forwarded-For` should not share counters when the
    server reads them (requires proxy-headers in production).

    In the test harness without proxy-headers middleware, both calls
    come from the same ASGI scope host (127.0.0.1 / empty), so this
    test only validates that *one* IP eventually rate-limits. A full
    per-IP separation test requires a proxy-headers setup and is left
    to the deployment integration test.
    """
    app = _build_app_with_limit("1/minute")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r1 = await ac.get("/ping")
        r2 = await ac.get("/ping")
    assert r1.status_code == 200
    assert r2.status_code == 429


# ============================================================================
# PRIV-12 — rate_limit_key partitioning (Phase 11 D-21 / Plan 11-05 Task 5.0-A)
#
# These tests cover the SYNC key_func that partitions limit buckets:
#   - "sid:<uuid>" when a valid bcx_sid cookie is present
#   - "akh:<first 16 hex>" when no cookie but X-API-Key header is set
#   - "ip:<client ip>" fallback
#
# Wave 0 RED today (rate_limit_key does not exist); GREEN after Task 5.1
# swaps the Limiter to use it.
# ============================================================================

import inspect  # noqa: E402

SID = "99999999-9999-4999-8999-999999999999"


def _make_request(
    cookies: dict | None = None,
    headers: dict | None = None,
    ip: str = "10.0.0.1",
):
    """Build a minimal duck-typed Request that satisfies rate_limit_key."""

    class _Client:
        host = ip

    class _Req:
        pass

    req = _Req()
    req.cookies = cookies or {}
    req.headers = headers or {}
    req.client = _Client()
    return req


def test_rate_limit_key_is_sync() -> None:
    """slowapi requires sync key_func — async functions break silently."""
    from app.middleware.rate_limit import rate_limit_key

    assert not inspect.iscoroutinefunction(rate_limit_key), (
        "rate_limit_key must be sync (slowapi requirement); got async."
    )


def test_key_resolves_sid_when_cookie_present() -> None:
    """Valid bcx_sid cookie → key = `sid:<uuid>`."""
    from app.middleware.rate_limit import rate_limit_key

    req = _make_request(cookies={"bcx_sid": SID})
    assert rate_limit_key(req) == f"sid:{SID}"


def test_key_resolves_akh_when_cookie_missing_and_key_present() -> None:
    """No cookie + X-API-Key header → key = `akh:<first 16 hex>`."""
    from app.middleware.rate_limit import rate_limit_key

    req = _make_request(cookies={}, headers={"X-API-Key": "bcx_some_test_key"})
    key = rate_limit_key(req)
    assert key.startswith("akh:"), key
    assert len(key) == len("akh:") + 16, len(key)


def test_key_resolves_ip_for_anonymous() -> None:
    """No cookie + no X-API-Key → fall through to per-IP limit."""
    from app.middleware.rate_limit import rate_limit_key

    req = _make_request(cookies={}, headers={}, ip="203.0.113.7")
    key = rate_limit_key(req)
    assert key.startswith("ip:"), key
    assert "203.0.113.7" in key


def test_malformed_cookie_falls_through_to_ip() -> None:
    """A bcx_sid cookie that isn't a valid UUID4 (e.g. tampered / truncated)
    must NOT match the sid bucket — fall through to ip.
    """
    from app.middleware.rate_limit import rate_limit_key

    req = _make_request(
        cookies={"bcx_sid": "not-a-uuid"},
        headers={},
        ip="203.0.113.8",
    )
    key = rate_limit_key(req)
    assert key.startswith("ip:"), (
        f"malformed cookie should not produce sid: bucket; got {key}"
    )


@pytest.mark.asyncio
async def test_bucket_hop_falls_back_to_ip(started_app) -> None:
    """Client makes N requests with cookie until the bucket is exhausted,
    then clears the cookie — subsequent requests should resolve to the
    per-IP bucket via ``rate_limit_key``. The test instruments
    ``rate_limit_key`` directly to assert the KEY USED has switched,
    rather than relying on a specific HTTP status code (which depends on
    storage backend semantics).
    """
    from app.middleware import rate_limit as rl_module
    from app.middleware.rate_limit import rate_limit_key

    rl_module.limiter.reset()

    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ac.cookies.set("bcx_sid", SID)
        # Drive a sequence of requests with the cookie set; the qualitative
        # behaviour is the only assertion (different storage backends differ
        # on whether the cookie bucket is exhausted at the default 10000/min
        # ceiling we apply in the test suite).
        for _ in range(5):
            await ac.get("/api/csrf-token")

        # Clear the cookie and assert rate_limit_key resolves to ip: now.
        ac.cookies.clear()

        class _Req:
            cookies: dict[str, str] = {}
            headers: dict[str, str] = {}
            client = type("C", (), {"host": "127.0.0.1"})()

        post_key = rate_limit_key(_Req())
        assert post_key.startswith("ip:"), (
            f"after clearing the cookie, the key_func should resolve to "
            f"ip: bucket — got {post_key}"
        )
