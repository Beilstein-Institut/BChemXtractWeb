"""FastAPI application factory with lifespan and CORS configuration.

The app factory pattern allows flexible instantiation for both
production (uvicorn) and testing (httpx.AsyncClient) contexts.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html
from fastapi.responses import HTMLResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.errors import (
    BridgeError,
    bridge_error_handler,
    http_exception_handler,
    rate_limit_exceeded_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.middleware.rate_limit import limiter
from app.routers import (
    admin_api_keys,
    auth,
    batch,
    export,
    extract,
    health,
    history,
    inchi,
    me,
    pubchem,
    reactions,
    search,
)
from app.services.db import assert_rls_enforceable
from app.services.jvm_bridge import initialize_jvm, shutdown_pool

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler.

    Startup:
        1. Probe the DB connection role: refuse to start if the runtime
           user has SUPERUSER or BYPASSRLS (those attributes silently
           bypass RLS even with FORCE ROW LEVEL SECURITY). The
           ``bchemxtract_app`` role created by the 2026_05_16 migration
           satisfies this; backend services connect as it.
        2. Initialise the JVM with the BChemXtract JAR and create the
           thread pool.
    Shutdown: shut down the thread pool (JVM shutdown is skipped — it is
              irreversible per JPype).

    Alembic migrations are NO LONGER run from the request-path process.
    Operators must apply migrations via the standalone
    ``migrate`` service in docker-compose (``alembic upgrade head``)
    before bringing the backend up. Rationale:

      * Concurrent ``upgrade`` races are impossible when only one
        container runs migrations.
      * The application DB role no longer needs DDL privileges for the
        lifetime of every request.
      * A broken migration fails the one-shot migrate container with a
        clear exit code rather than silently crashlooping the backend
        until Docker gives up.

    Raises:
        RuntimeError: If the runtime DB role has SUPERUSER or BYPASSRLS
            (RLS would be bypassed for every query — refuse to start).
        JVMStartupError: If JVM fails to start (fatal — app exits,
            Docker restarts).
    """
    await assert_rls_enforceable()
    initialize_jvm(settings)
    yield
    shutdown_pool()


# Curated OpenAPI metadata. Each tag groups the routes
# assigned to it in /docs and /redoc. Descriptions render in both UIs as
# the expandable section header.
_TAGS_METADATA = [
    {
        "name": "extraction",
        "description": (
            "Upload CDX/CDXML files and extract chemical substances and "
            "reactions. Synchronous path for single files. Reactions are "
            "opt-in via a separate endpoint (experimental)."
        ),
    },
    {
        "name": "history",
        "description": (
            "List, retrieve, and delete extraction records. Substances "
            "are deduplicated across all extractions via InChI key."
        ),
    },
    {
        "name": "search",
        "description": (
            "Search all stored substances by InChI key, molecular formula, "
            "canonical SMILES, or SMARTS substructure.\n\n"
            "**Scale note:** iterates all stored substances in the JVM. "
            "Expect ~300 ms - 2 s on libraries of <=2k substances. Future "
            "revisions will move to the RDKit PostgreSQL cartridge for "
            "larger scale."
        ),
    },
    {
        "name": "batch",
        "description": (
            "Queue multi-file extractions with Server-Sent Event progress streams."
        ),
    },
    {
        "name": "pubchem",
        "description": (
            "Opt-in PubChem enrichment of extracted structures, joined on "
            "InChIKey. Disabled by default; sends InChIKeys to NCBI when on."
        ),
    },
    {
        "name": "export",
        "description": (
            "Export selected substances or an entire extraction in six "
            "formats: SDF, JSON, CSV, PNG, SVG, MDL V3000."
        ),
    },
    {
        "name": "health",
        "description": "Liveness and detailed JVM diagnostics.",
    },
    {
        "name": "auth",
        "description": (
            "Cookie/recovery-code/CSRF-token endpoints. "
            "Unauthenticated entry points used by browsers before any "
            "extraction request."
        ),
    },
    {
        "name": "admin",
        "description": (
            "Admin-only API key management. Gated by "
            "`X-Admin-Secret`; excluded from CSRF."
        ),
    },
    {
        "name": "me",
        "description": (
            "Authenticated-session-bound endpoints. "
            "Currently only the GDPR `DELETE /me/data` erase route."
        ),
    },
]


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    Security-relevant behaviour:

    - ``/docs``, ``/redoc``, ``/openapi.json`` are suppressed when
      :attr:`Settings.expose_openapi_docs` is false (defaults to
      ``settings.debug``). Prevents API-surface disclosure in production.
    - Every ``/api/*`` router except :mod:`health`, :mod:`auth`, and
      :mod:`admin_api_keys` runs ``get_scoped_db`` which validates
      X-API-Key against the api_keys table, auto-issues
      a ``bcx_sid`` cookie on first browser visit, and sets the
      Postgres RLS context. ``/health/detail`` is
      additionally gated by ``require_admin_auth`` because it discloses
      JVM diagnostics that scrapers should not see; the minimal
      ``/health`` endpoint stays open for Docker HEALTHCHECK probes.
    - Per-IP rate limits are enforced by ``slowapi`` with configurable
      thresholds per resource class (DoS hardening). Exceeding a
      limit produces a ``429`` through the unified ``ErrorResponse`` shape.
    """
    docs_visible = settings.expose_openapi_docs

    application = FastAPI(
        title="BChemXtract Web API",
        description=(
            "Extract chemical structures and reactions from ChemDraw files. "
            "Upload, browse, search, and export — all through a REST API "
            "with auto-generated OpenAPI documentation."
        ),
        version="0.1.0",
        lifespan=lifespan,
        openapi_tags=_TAGS_METADATA,
        docs_url="/docs" if docs_visible else None,
        redoc_url=None,  # Custom redoc below; never auto-mounted.
        openapi_url="/openapi.json" if docs_visible else None,
    )

    # Attach the slowapi limiter to app.state so SlowAPIMiddleware can pick it
    # up. This must happen before add_middleware(SlowAPIMiddleware).
    application.state.limiter = limiter

    # Unified ErrorResponse handlers. Order of registration
    # does not matter — FastAPI dispatches by exception type. The BridgeError
    # handler must remain the single registered handler for that class
    # to avoid a second add_exception_handler overwriting it.
    application.add_exception_handler(HTTPException, http_exception_handler)
    application.add_exception_handler(
        RequestValidationError, validation_exception_handler
    )
    application.add_exception_handler(BridgeError, bridge_error_handler)
    application.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    application.add_exception_handler(Exception, unhandled_exception_handler)

    # CORS middleware -- allows frontend dev server access. Must be added
    # BEFORE SlowAPIMiddleware so preflight OPTIONS requests aren't counted
    # against the rate limit (slowapi exempts OPTIONS by default but ordering
    # ensures the CORS headers land on limited responses too).
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Rate limiting — global default applied by this middleware; per-route
    # overrides use @limiter.limit() in the router modules.
    application.add_middleware(SlowAPIMiddleware)

    # CSRF synchronizer-token verification for cookie-auth
    # state-changing requests. Skipped for:
    #   - safe methods (GET/HEAD/OPTIONS)
    #   - X-API-Key / X-Admin-Secret authenticated requests (CLI + admins)
    #   - /api/csrf-token (the token-issuing endpoint itself)
    #   - /api/health and /api/health/detail (Docker HEALTHCHECK)
    #
    # When the caller carries a valid bcx_sid cookie, an HMAC-bound
    # `X-CSRF-Token` is required; rejected requests return 403 with the
    # unified ErrorResponse code `CSRF_INVALID`.
    @application.middleware("http")
    async def csrf_middleware(request, call_next):
        from fastapi.responses import JSONResponse

        from app.core.security import verify_csrf_token
        from app.core.session import _UUID_RE, SESSION_COOKIE
        from app.models.chemistry import ErrorResponse

        path = request.url.path
        method = request.method

        skip = (
            method in ("GET", "HEAD", "OPTIONS")
            or request.headers.get("X-API-Key") is not None
            or request.headers.get("X-Admin-Secret") is not None
            or path == "/api/csrf-token"
            or path.endswith("/health")
            or path.endswith("/health/detail")
        )
        if not skip:
            sid = request.cookies.get(SESSION_COOKIE)
            if sid and _UUID_RE.match(sid):
                # Browser cookie auth → CSRF token required.
                csrf_token = request.headers.get("X-CSRF-Token", "")
                if not verify_csrf_token(csrf_token, sid):
                    return JSONResponse(
                        status_code=403,
                        content=ErrorResponse(
                            detail="Invalid or missing CSRF token",
                            code="CSRF_INVALID",
                        ).model_dump(),
                    )
        return await call_next(request)

    # Register routers.
    #
    # `health.router` stays unauthenticated at the router level because
    # `GET /api/health` must answer Docker HEALTHCHECK without credentials.
    # `/api/health/detail` is protected at the route level inside
    # routers/health.py.
    #
    # `auth.router` hosts the cookie / recovery-code /
    # CSRF-token endpoints. It is mounted WITHOUT the scoped dependency
    # because PUT /api/auth/me is the entry point that ISSUES the cookie
    # — running set_rls_context before the cookie exists would race the
    # bootstrap. No API key is required either: a fresh browser holds none.
    application.include_router(auth.router, prefix="/api")
    application.include_router(health.router, prefix="/api")

    # Admin uses X-Admin-Secret (not cookie/key) — separate from the
    # protected list. CSRF middleware already skips admin via the
    # X-API-Key / X-Admin-Secret header skip; admin endpoints rely on
    # require_admin_auth (router-level).
    application.include_router(
        admin_api_keys.router,
        prefix="/api/admin",
        tags=["admin"],
    )

    # Local import to avoid the import-time cycle between app.services.db
    # and app.config that triggers when main.py is imported by app.config
    # transitively (settings → cors_origins parsing pulls in middleware
    # that pulls in main); routers/auth.py uses the same pattern.
    from app.services.db import get_scoped_db

    # Every /api/* router except /api/health and
    # /api/auth/* runs get_scoped_db which:
    #   - resolves (session_id, api_key_hash) from the cookie/header
    #   - validates X-API-Key against the api_keys table
    #     (unknown / revoked / expired → 401)
    #   - auto-issues bcx_sid on first browser visit
    #   - sets the Postgres RLS context (set_config) so user queries are
    #     filtered structurally even if a router forgets the WHERE clause
    # CSRF protection runs in the middleware ahead of these dependencies.
    protected = [Depends(get_scoped_db)]
    for router in (
        extract,
        history,
        batch,
        export,
        reactions,
        search,
        inchi,
        me,
        pubchem,
    ):
        application.include_router(router.router, prefix="/api", dependencies=protected)

    # Redoc is served only when OpenAPI docs are exposed. It requires
    # openapi_url to be non-None, so we gate both behind the same flag.
    if docs_visible:

        @application.get("/redoc", include_in_schema=False)
        async def custom_redoc_html() -> HTMLResponse:
            return get_redoc_html(
                openapi_url=application.openapi_url or "/openapi.json",
                title=f"{application.title} — API Reference",
            )

    return application


app = create_app()
