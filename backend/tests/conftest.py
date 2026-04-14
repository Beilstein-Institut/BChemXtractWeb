"""Shared pytest fixtures for backend tests."""

from pathlib import Path

import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.main import app
from app.models.orm import Base

FIXTURES_DIR = (
    Path(__file__).parent.parent
    / "lib"
    / "bchemxtract"
    / "src"
    / "test"
    / "resources"
)

# --- Phase 5: test database URL ---
TEST_DB_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/bchemxtract_test"


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


# --- Phase 5: async DB session fixtures ---


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create all ORM tables in a dedicated test database.

    Session-scoped: tables created once, dropped after all persistence tests.
    Requires bchemxtract_test database to exist. Create it once with:
        psql -U postgres -c "CREATE DATABASE bchemxtract_test;"
    """
    eng = create_async_engine(TEST_DB_URL, poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncSession:
    """Async DB session backed by test database. Rolls back after each test."""
    factory = async_sessionmaker(test_engine, expire_on_commit=False)
    async with factory() as session:
        yield session
        await session.rollback()
