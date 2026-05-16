"""Shared pytest fixtures for backend tests."""

# Configure security-related environment BEFORE importing the app so the
# Settings validator sees a valid configuration. The default test suite
# runs with permissive rate limits (effectively disabled) and a fixed
# API key; focused security tests override these via monkeypatch +
# limiter resets.
import os

os.environ.setdefault(
    "API_KEYS",
    '["test-api-key-for-test-suite-with-sufficient-length-0123456789"]',
)
os.environ.setdefault(
    "SECRET_KEY",
    "test-secret-key-for-test-suite-32-characters-min-0123",
)
os.environ.setdefault(
    "ADMIN_SECRET",
    "test-admin-secret-32-characters-min-0123456789",
)
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("EXPOSE_OPENAPI_DOCS", "true")
# SEC H-04: DATABASE_URL has no default in Settings; tests always target
# the dedicated bchemxtract_test DB.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/bchemxtract_test",
)
# Loosen rate limits for the general test suite — specific rate-limit
# tests narrow the limit + reset counters explicitly.
os.environ.setdefault("RATE_LIMIT_DEFAULT", "10000/minute")
os.environ.setdefault("RATE_LIMIT_UPLOAD", "10000/minute")
os.environ.setdefault("RATE_LIMIT_BATCH", "10000/minute")
os.environ.setdefault("RATE_LIMIT_SEARCH", "10000/minute")
os.environ.setdefault("RATE_LIMIT_EXPORT", "10000/minute")

from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from asgi_lifespan import LifespanManager  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool  # noqa: E402

from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.models.orm import Base  # noqa: E402

# Single canonical test API key — exposed to tests that need to construct
# ad-hoc clients (e.g. unauth_client -> 401 assertion, then adds header
# and re-asserts 200).
TEST_API_KEY = settings.api_keys[0]
TEST_AUTH_HEADERS = {"Authorization": f"Bearer {TEST_API_KEY}"}

# Substance + reaction fixtures both live under backend/tests/fixtures/.
# Substance fixtures (under substances/) were copied verbatim from upstream
# BChemXtract's src/test/resources/ when the submodule was retired — see the
# tree at https://github.com/Beilstein-Institut/BChemXtract/tree/v1.1.1/src/test/resources.
# Re-copy from a newer upstream tag if/when those tests need to track changes.
FIXTURES_DIR = Path(__file__).parent / "fixtures" / "substances"
REACTION_FIXTURES_DIR = Path(__file__).parent / "fixtures" / "reactions"

# --- Phase 5: test database URL ---
TEST_DB_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/bchemxtract_test"


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _ensure_test_schema():
    """Create the ORM schema on the integration test DB before any test runs.

    The backend lifespan used to ``alembic upgrade head`` on startup — per
    SEC M-08 that's now the operator's job. Tests therefore can't rely on
    the lifespan to initialise the schema, and any test that hits
    ``client`` without also depending on ``db_session`` would otherwise
    see "relation does not exist" from a pristine test DB.

    This autouse session fixture creates tables once per pytest run via
    ``Base.metadata.create_all`` against the same test DB the app points
    at. It is idempotent (``create_all`` ignores existing tables) and
    drops the schema at the end so the next run starts clean.
    """
    # ``settings.database_url`` was set in module-init from DATABASE_URL;
    # conftest defaults that to the bchemxtract_test DB above.
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(scope="session")
async def started_app():
    """App with lifespan events triggered (JVM started).

    Session-scoped: JVM starts once for all tests in the suite.
    """
    async with LifespanManager(app) as manager:
        yield manager.app


@pytest.fixture
async def client(started_app) -> AsyncClient:
    """Authenticated async HTTP client connected to the lifespan-started app.

    Use for integration tests that need JVM (health detail, extraction, etc.).
    The ``Authorization: Bearer <test-key>`` header is set on the underlying
    AsyncClient so every request in the suite authenticates transparently.
    Tests that need to probe the unauthenticated surface use
    ``unauth_client`` instead.
    """
    transport = ASGITransport(app=started_app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers=TEST_AUTH_HEADERS,
    ) as ac:
        yield ac


@pytest.fixture
async def client_no_jvm() -> AsyncClient:
    """Authenticated async HTTP client WITHOUT lifespan (no JVM).

    Use for pure-Python unit tests (format detection, config validation, etc.).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers=TEST_AUTH_HEADERS,
    ) as ac:
        yield ac


@pytest.fixture
async def unauth_client() -> AsyncClient:
    """Un-authenticated async HTTP client for auth-failure tests only.

    No ``Authorization`` header set. Used by ``test_auth.py`` to assert
    that protected endpoints return 401 when called without a bearer
    token. Do NOT use for general integration tests — every route except
    ``/api/health`` requires an API key.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(scope="session")
def cdx_file_bytes() -> bytes:
    """L-lactic-acid.cdx -- small single-substance CDX file for fast tests.

    Source: BChemXtract upstream test resources (vendored locally) (D-12).
    """
    path = FIXTURES_DIR / "integrationTests" / "L-lactic-acid.cdx"
    return path.read_bytes()


@pytest.fixture
def simple_v3000_block() -> str:
    """Minimal valid MDL V3000 molblock (single chloride ion).

    Used by the lazy-SVG backfill tests to exercise the parse-and-render
    path without depending on a full CDX/CDXML fixture.
    """
    return (
        "\n"
        "  BChemXtract\n"
        "\n"
        "  0  0  0  0  0  0  0  0  0  0999 V3000\n"
        "M  V30 BEGIN CTAB\n"
        "M  V30 COUNTS 1 0 0 0 0\n"
        "M  V30 BEGIN ATOM\n"
        "M  V30 1 Cl 0.0 0.0 0.0 0 CHG=-1\n"
        "M  V30 END ATOM\n"
        "M  V30 END CTAB\n"
        "M  END\n"
    )


@pytest.fixture(scope="session")
def cdxml_file_bytes() -> bytes:
    """test_fixture.cdxml -- multi-substance CDXML file.

    Source: BChemXtract upstream test resources (vendored locally) (D-12).
    """
    path = FIXTURES_DIR / "cdx" / "reader" / "test_fixture.cdxml"
    return path.read_bytes()


@pytest.fixture(scope="session")
def cdx_multi_file_bytes() -> bytes:
    """test_fixture.cdx -- multi-substance CDX file.

    Source: BChemXtract upstream test resources (vendored locally) (D-12).
    """
    path = FIXTURES_DIR / "cdx" / "reader" / "test_fixture.cdx"
    return path.read_bytes()


# --- Phase 10: reaction fixtures (read from LOCAL REACTION_FIXTURES_DIR) ---


@pytest.fixture(scope="session")
def cdx_reaction_file_bytes() -> bytes:
    """Simple single-reaction CDX fixture.

    Source: copied from BChemXtract upstream integrationTests/reactions/
    into backend/tests/fixtures/reactions/ (Phase 10 D-03).
    """
    path = REACTION_FIXTURES_DIR / "simple_reaction.cdx"
    return path.read_bytes()


@pytest.fixture(scope="session")
def cdx_multi_reaction_file_bytes() -> bytes:
    """Multi-reaction CDX fixture for RDF export tests."""
    path = REACTION_FIXTURES_DIR / "multi_step_reaction.cdx"
    return path.read_bytes()


@pytest.fixture(scope="session")
def cdxml_reaction_file_bytes() -> bytes:
    """Single-reaction CDXML fixture for format-detection tests."""
    path = REACTION_FIXTURES_DIR / "forward.cdxml"
    return path.read_bytes()


@pytest.fixture(scope="session")
def cdx_reversible_reaction_file_bytes() -> bytes:
    """Reversible reaction CDX fixture for reaction_smiles edge cases."""
    path = REACTION_FIXTURES_DIR / "reversible.cdx"
    return path.read_bytes()


@pytest.fixture(scope="session")
def cdxml_chemotion_reaction_file_bytes() -> bytes:
    """Chemotion-authored CDXML reaction fixture (realistic lab file)."""
    path = REACTION_FIXTURES_DIR / "chemotion_CRR-43.cdxml"
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
