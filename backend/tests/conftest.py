"""Shared pytest fixtures for backend tests."""

# Configure security-related environment BEFORE importing the app so the
# Settings validator sees a valid configuration. The default test suite
# runs with permissive rate limits (effectively disabled) and a fixed
# session cookie; focused security tests override these via monkeypatch +
# limiter resets.
import os

os.environ.setdefault(
    "SECRET_KEY",
    "test-secret-key-for-test-suite-32-characters-min-0123",
)
os.environ.setdefault(
    "ADMIN_SECRET",
    "test-admin-secret-32-characters-min-0123456789",
)
# APP_DB_PASSWORD is consumed by the 2026_05_16_create_app_role alembic
# migration. The test suite does NOT exercise that migration (the autouse
# `_ensure_test_schema` fixture uses Base.metadata.create_all instead),
# but the seed keeps `alembic upgrade head` runnable against the test DB
# in CI scripts that want to validate the migration chain end-to-end.
#
# RLS-enforcement caveat: the test DATABASE_URL below connects as a
# superuser role (the default postgres user in the test DB), which
# bypasses RLS even with FORCE ROW LEVEL SECURITY. RLS enforcement is
# verified end-to-end via Playwright against the production-shape
# docker-compose stack (backend connects as bchemxtract_app, the
# 2026_05_16 migration's NOSUPERUSER NOBYPASSRLS role). The unit tests
# under tests/test_session_isolation.py verify the WIRING (set_rls_context
# is called, scope is propagated to ORM writes) — not the policy
# enforcement itself.
os.environ.setdefault(
    "APP_DB_PASSWORD",
    "test-app-db-password-32-characters-min-0123456789",
)
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("EXPOSE_OPENAPI_DOCS", "true")
# CORS_ORIGINS in the test suite must NOT contain localhost/127.0.0.1
# because the Plan 11-05 _validate_prod_cors guard rejects that
# combination under DEBUG=false. Tests run in prod-mode posture
# (DEBUG=false) to exercise the full security validator chain.
os.environ.setdefault("CORS_ORIGINS", '["http://test"]')
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

# Canonical session-cookie value for the default test client (Phase 11
# Plan 11-05). Tests that need to probe the un-cookied surface use
# ``unauth_client``. Tests that need to assert admin behaviour use
# ``admin_client`` (TEST_ADMIN_HEADERS). A valid UUID4 satisfies the
# strict ``_UUID_RE`` in ``app.core.session``.
TEST_SESSION_COOKIE = "11111111-1111-4111-8111-111111111111"
TEST_ADMIN_HEADERS = {"X-Admin-Secret": os.environ["ADMIN_SECRET"]}

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
    """Cookie-authenticated async HTTP client connected to the lifespan-started app.

    Use for integration tests that need JVM (health detail, extraction, etc.).
    The ``bcx_sid`` cookie is set on the underlying AsyncClient so every
    request in the suite authenticates as the same session transparently.
    Tests that need to probe the un-cookied surface use ``unauth_client``
    instead; tests against admin endpoints use ``admin_client``.
    """
    transport = ASGITransport(app=started_app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"bcx_sid": TEST_SESSION_COOKIE},
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def client_csrf(client: AsyncClient) -> AsyncClient:
    """Same as ``client`` but pre-bootstraps a CSRF token and auto-injects
    ``X-CSRF-Token`` on every subsequent request.

    Used by integration tests that issue POST / PUT / PATCH / DELETE under
    cookie auth — without ``X-CSRF-Token`` the CSRF middleware returns
    403 ``CSRF_INVALID`` (Plan 11-04 D-19).
    """
    resp = await client.get("/api/csrf-token")
    assert resp.status_code == 200, resp.text
    token = resp.json()["csrf_token"]
    client.headers.update({"X-CSRF-Token": token})
    return client


@pytest.fixture
async def admin_client(started_app) -> AsyncClient:
    """Admin-authenticated async HTTP client (X-Admin-Secret header set).

    Use for tests against ``/api/admin/*`` endpoints. The CSRF middleware
    skips X-Admin-Secret requests, so this client can issue POST / DELETE
    without a CSRF token.
    """
    transport = ASGITransport(app=started_app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers=TEST_ADMIN_HEADERS,
    ) as ac:
        yield ac


@pytest.fixture
async def client_no_jvm() -> AsyncClient:
    """Cookie-authenticated async HTTP client WITHOUT lifespan (no JVM).

    Use for pure-Python unit tests (format detection, config validation, etc.).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"bcx_sid": TEST_SESSION_COOKIE},
    ) as ac:
        yield ac


@pytest.fixture
async def unauth_client() -> AsyncClient:
    """Un-cookied async HTTP client for auth / session-isolation tests.

    No ``bcx_sid`` cookie and no headers set. Used to assert the
    un-cookied request flow — e.g. that a fresh browser request gets
    a Set-Cookie back from get_scoped_db, or that the cross-session
    isolation tests can mint two distinct sessions.
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
