"""Shared pytest fixtures for backend tests."""

from pathlib import Path

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from app.main import app

FIXTURES_DIR = (
    Path(__file__).parent.parent
    / "lib"
    / "bchemxtract"
    / "src"
    / "test"
    / "resources"
)


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


@pytest.fixture(scope="session")
def cdx_file_bytes() -> bytes:
    """L-lactic-acid.cdx -- small single-substance CDX file for fast tests.

    Source: BChemXtract submodule test resources (D-12).
    """
    path = FIXTURES_DIR / "integrationTests" / "L-lactic-acid.cdx"
    return path.read_bytes()


@pytest.fixture(scope="session")
def cdxml_file_bytes() -> bytes:
    """test_fixture.cdxml -- multi-substance CDXML file.

    Source: BChemXtract submodule test resources (D-12).
    """
    path = FIXTURES_DIR / "cdx" / "reader" / "test_fixture.cdxml"
    return path.read_bytes()


@pytest.fixture(scope="session")
def cdx_multi_file_bytes() -> bytes:
    """test_fixture.cdx -- multi-substance CDX file.

    Source: BChemXtract submodule test resources (D-12).
    """
    path = FIXTURES_DIR / "cdx" / "reader" / "test_fixture.cdx"
    return path.read_bytes()
