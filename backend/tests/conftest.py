"""Shared pytest fixtures for backend tests."""

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture(scope="session")
async def started_app():
    """App with lifespan events triggered (JVM started).

    Session-scoped: JVM starts once for all tests in the suite.
    """
    async with LifespanManager(app) as manager:
        yield manager.app


@pytest.fixture
async def client(started_app) -> AsyncClient:
    """Async HTTP client connected to lifespan-started app.

    Use for integration tests that need JVM (health detail, extraction, etc.).
    """
    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def client_no_jvm() -> AsyncClient:
    """Async HTTP client WITHOUT lifespan (no JVM).

    Use for pure-Python unit tests (format detection, config validation, etc.).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
