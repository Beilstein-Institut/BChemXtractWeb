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
    app.add_exception_handler(
        RequestValidationError, validation_exception_handler
    )
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
    assert "retry-after" in {h.lower() for h in r.headers.keys()}


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
