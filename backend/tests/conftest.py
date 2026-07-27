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
# APP_DB_PASSWORD is read by the 2026_05_16_create_app_role migration. The
# unit suite uses Base.metadata.create_all (see `_ensure_test_schema`) and
# does NOT exercise that migration, but the seed keeps `alembic upgrade head`
# runnable in CI for migration-chain validation.
#
# RLS caveat: the test DATABASE_URL below connects as a superuser, which
# bypasses RLS even with FORCE ROW LEVEL SECURITY. Unit tests therefore
# verify the *wiring* (set_rls_context called, scope threaded through writes
# — tests/test_session_isolation.py); policy enforcement is validated
# end-to-end via Playwright against the docker-compose stack (where the
# backend connects as the NOSUPERUSER NOBYPASSRLS bchemxtract_app role).
os.environ.setdefault(
    "APP_DB_PASSWORD",
    "test-app-db-password-32-characters-min-0123456789",
)
# Tests connect to bchemxtract_test as the bootstrap postgres superuser
# (rolsuper=true, rolbypassrls=true). assert_rls_enforceable() in the
# backend lifespan would otherwise refuse to start. RLS *enforcement* is
# verified end-to-end via Playwright; tests verify the wiring.
os.environ.setdefault("ALLOW_SUPERUSER_DB", "true")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("EXPOSE_OPENAPI_DOCS", "true")
# CORS_ORIGINS in the test suite must NOT contain localhost/127.0.0.1
# because the _validate_prod_cors guard rejects that combination under
# DEBUG=false. Tests run in prod-mode posture (DEBUG=false) to exercise
# the full security validator chain.
os.environ.setdefault("CORS_ORIGINS", '["http://test"]')
# DATABASE_URL has no default in Settings; tests always target
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
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool  # noqa: E402

from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.models.orm import Base  # noqa: E402
from app.services.orphan_sweep import SWEEP_DDL  # noqa: E402

# Canonical session-cookie value for the default test client.
# Tests that need to probe the un-cookied surface use
# ``unauth_client``. Tests that need to assert admin behaviour use
# ``admin_client`` (TEST_ADMIN_HEADERS). A valid UUID4 satisfies the
# strict ``_UUID_RE`` in ``app.core.session``.
TEST_SESSION_COOKIE = "11111111-1111-4111-8111-111111111111"
TEST_ADMIN_HEADERS = {"X-Admin-Secret": os.environ["ADMIN_SECRET"]}

# Shared marker for tests that depend on RLS *enforcement* (cross-session
# isolation, no-merge restore semantics, GDPR orphan-sweep boundaries).
# Skips when the test DB connects as a SUPERUSER / BYPASSRLS role and the
# ``ALLOW_SUPERUSER_DB`` escape hatch is active — Postgres bypasses RLS for
# such roles regardless of FORCE ROW LEVEL SECURITY. End-to-end RLS is
# verified via Playwright against the production-shape docker-compose stack.
skip_under_superuser_db = pytest.mark.skipif(
    os.environ.get("ALLOW_SUPERUSER_DB", "").lower() == "true",
    reason="RLS enforcement requires a NOSUPERUSER NOBYPASSRLS DB role",
)


async def link_substances_to_extraction(
    inchi_keys: list[str],
    session_id: str = TEST_SESSION_COOKIE,
    *,
    filename: str = "seed.cdx",
) -> int:
    """Create an extraction owned by ``session_id`` and link already-inserted
    substances to it via ``extraction_substances``; return the extraction id.

    Substance reads are RLS-scoped through the ExtractionSubstance join (the
    ``substances`` table has no RLS of its own), so a seeded substance only
    becomes visible to global search / stats once it is linked to one of the
    caller's extractions. Tests that insert bare substances and then search
    must call this. Sets ``app.session_id`` first so the inserts pass the
    policy WITH CHECK when the suite runs under the NOSUPERUSER app role.
    """
    from sqlalchemy import text

    from app.services.db import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        await db.execute(
            text("SELECT set_config('app.session_id', :sid, true)"),
            {"sid": session_id},
        )
        eid = (
            await db.execute(
                text(
                    "INSERT INTO extractions (session_id, filename, file_size, "
                    "format, structure_count, extraction_time_ms, warnings) "
                    "VALUES (:sid, :fn, 1, 'cdx', :n, 0, '[]'::jsonb) RETURNING id"
                ),
                {"sid": session_id, "fn": filename, "n": len(inchi_keys)},
            )
        ).scalar_one()
        for pos, key in enumerate(inchi_keys):
            sub_id = (
                await db.execute(
                    text("SELECT id FROM substances WHERE inchi_key = :k"),
                    {"k": key},
                )
            ).scalar_one_or_none()
            if sub_id is None:
                continue
            await db.execute(
                text(
                    "INSERT INTO extraction_substances "
                    "(extraction_id, substance_id, position, session_id) "
                    "VALUES (:eid, :sub, :pos, :sid)"
                ),
                {"eid": eid, "sub": sub_id, "pos": pos, "sid": session_id},
            )
        await db.commit()
        return eid


# Substance + reaction fixtures both live under backend/tests/fixtures/.
# Substance fixtures (under substances/) were copied verbatim from upstream
# BChemXtract's src/test/resources/ when the submodule was retired — see the
# tree at https://github.com/Beilstein-Institut/BChemXtract/tree/v1.1.1/src/test/resources.
# Re-copy from a newer upstream tag if/when those tests need to track changes.
FIXTURES_DIR = Path(__file__).parent / "fixtures" / "substances"
REACTION_FIXTURES_DIR = Path(__file__).parent / "fixtures" / "reactions"

# --- test database URL ---
# Single source of truth: follows DATABASE_URL (set via env or the setdefault
# above), so pointing the suite at a different Postgres only needs DATABASE_URL.
TEST_DB_URL = os.environ["DATABASE_URL"]


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _ensure_test_schema():
    """Create the ORM schema on the integration test DB before any test runs.

    The backend lifespan used to ``alembic upgrade head`` on startup — that's
    now the operator's job. Tests therefore can't rely on
    the lifespan to initialise the schema, and any test that hits
    ``client`` without also depending on ``db_session`` would otherwise
    see "relation does not exist" from a pristine test DB.

    This autouse session fixture creates tables once per pytest run via
    ``Base.metadata.create_all`` against the same test DB the app points
    at. It is idempotent (``create_all`` ignores existing tables) and
    drops the schema at the end so the next run starts clean.

    ``SWEEP_DDL`` is applied on top: the orphan sweep lives in a
    SECURITY DEFINER function that create_all knows nothing about, and
    every delete path calls it. Applying the same statements the migration
    runs keeps the suite testing the function production actually uses.
    """
    # ``settings.database_url`` was set in module-init from DATABASE_URL;
    # conftest defaults that to the bchemxtract_test DB above.
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for statement in SWEEP_DDL:
            await conn.execute(text(statement))
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


async def _bootstrap_csrf(ac: AsyncClient) -> AsyncClient:
    """Fetch a CSRF token from ``/api/csrf-token`` and inject it as a default
    ``X-CSRF-Token`` header on the given client. Returns the same client.

    Without this header the CSRF middleware returns 403
    ``CSRF_INVALID`` on any state-changing cookie-auth request.
    """
    resp = await ac.get("/api/csrf-token")
    assert resp.status_code == 200, resp.text
    ac.headers.update({"X-CSRF-Token": resp.json()["csrf_token"]})
    return ac


@pytest_asyncio.fixture
async def client_csrf(client: AsyncClient) -> AsyncClient:
    """``client`` + pre-bootstrapped CSRF token (auto-injected per request).

    Used by integration tests that issue POST / PUT / PATCH / DELETE under
    cookie auth.
    """
    return await _bootstrap_csrf(client)


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


@pytest_asyncio.fixture
async def client_no_jvm_csrf(client_no_jvm: AsyncClient) -> AsyncClient:
    """``client_no_jvm`` + pre-bootstrapped CSRF token.

    Mirrors ``client_csrf`` for tests that hit the cookie-auth surface
    without booting the JVM lifespan.
    """
    return await _bootstrap_csrf(client_no_jvm)


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

    Source: BChemXtract upstream test resources (vendored locally).
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

    Source: BChemXtract upstream test resources (vendored locally).
    """
    path = FIXTURES_DIR / "cdx" / "reader" / "test_fixture.cdxml"
    return path.read_bytes()


@pytest.fixture(scope="session")
def cdx_multi_file_bytes() -> bytes:
    """test_fixture.cdx -- multi-substance CDX file.

    Source: BChemXtract upstream test resources (vendored locally).
    """
    path = FIXTURES_DIR / "cdx" / "reader" / "test_fixture.cdx"
    return path.read_bytes()


# --- reaction fixtures (read from LOCAL REACTION_FIXTURES_DIR) ---


@pytest.fixture(scope="session")
def cdx_reaction_file_bytes() -> bytes:
    """Simple single-reaction CDX fixture.

    Source: copied from BChemXtract upstream integrationTests/reactions/
    into backend/tests/fixtures/reactions/.
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


# --- async DB session fixtures ---


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
