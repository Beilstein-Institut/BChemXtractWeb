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
from app.middleware.auth import require_api_key
from app.middleware.rate_limit import limiter
from app.routers import batch, export, extract, health, history, reactions, search
from app.services.jvm_bridge import initialize_jvm, shutdown_pool

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler.

    Startup: initialise the JVM with the BChemXtract JAR and create the
             thread pool.
    Shutdown: shut down the thread pool (JVM shutdown is skipped — it is
              irreversible per JPype).

    Alembic migrations are NO LONGER run from the request-path process
    (SEC M-08). Operators must apply migrations via the standalone
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
        JVMStartupError: If JVM fails to start (fatal — app exits,
            Docker restarts).
    """
    initialize_jvm(settings)
    yield
    shutdown_pool()


# D-16 (Plan 09-05): curated OpenAPI metadata. Each tag groups the routes
# assigned to it in /docs and /redoc. Descriptions render in both UIs as
# the expandable section header.
_TAGS_METADATA = [
    {
        "name": "extraction",
        "description": (
            "Upload CDX/CDXML files and extract chemical substances and "
            "reactions. Synchronous path for single files. Reactions are "
            "opt-in via a separate endpoint (Plan 10, experimental)."
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
            "Queue multi-file extractions with Server-Sent Event progress "
            "streams."
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
]


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    Security-relevant behaviour:

    - ``/docs``, ``/redoc``, ``/openapi.json`` are suppressed when
      :attr:`Settings.expose_openapi_docs` is false (defaults to
      ``settings.debug``). Prevents API-surface disclosure in production.
    - Every ``/api/*`` router except :mod:`health` requires a valid bearer
      API key via :func:`require_api_key` (C-02). ``/health/detail`` is
      additionally protected at the route level because the minimal
      ``/health`` endpoint stays open for Docker HEALTHCHECK probes.
    - Per-IP rate limits are enforced by ``slowapi`` with configurable
      thresholds per resource class (H-05 / DoS hardening). Exceeding a
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

    # D-17 (Plan 09-05): unified ErrorResponse handlers. Order of registration
    # does not matter — FastAPI dispatches by exception type. The BridgeError
    # handler must remain the single registered handler for that class
    # (Pitfall 7) to avoid a second add_exception_handler overwriting it.
    application.add_exception_handler(HTTPException, http_exception_handler)
    application.add_exception_handler(
        RequestValidationError, validation_exception_handler
    )
    application.add_exception_handler(BridgeError, bridge_error_handler)
    application.add_exception_handler(
        RateLimitExceeded, rate_limit_exceeded_handler
    )
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

    # Register routers.
    #
    # `health.router` stays unauthenticated at the router level because
    # `GET /api/health` must answer Docker HEALTHCHECK without credentials.
    # `/api/health/detail` is protected at the route level inside
    # routers/health.py.
    #
    # Every other router requires a valid bearer API key.
    application.include_router(health.router, prefix="/api")
    protected = [Depends(require_api_key)]
    for router in (extract, history, batch, export, reactions, search):
        application.include_router(
            router.router, prefix="/api", dependencies=protected
        )

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
