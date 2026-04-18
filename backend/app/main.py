"""FastAPI application factory with lifespan and CORS configuration.

The app factory pattern allows flexible instantiation for both
production (uvicorn) and testing (httpx.AsyncClient) contexts.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html
from fastapi.responses import HTMLResponse

from app.config import settings
from app.errors import (
    BridgeError,
    bridge_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.routers import batch, export, extract, health, history, reactions, search
from app.services.jvm_bridge import initialize_jvm, shutdown_pool

logger = logging.getLogger(__name__)


async def _run_migrations() -> None:
    """Run Alembic migrations at startup to ensure schema is current.

    Alembic's env.py uses asyncio.run() internally, so we must run the
    synchronous command.upgrade() in a thread to avoid nested event loops.
    """
    import asyncio
    from functools import partial

    from alembic import command
    from alembic.config import Config

    def _upgrade() -> None:
        alembic_cfg = Config("alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
        command.upgrade(alembic_cfg, "head")

    await asyncio.get_event_loop().run_in_executor(None, _upgrade)
    logger.info("Alembic migrations applied (upgrade to head)")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler.

    Startup: Initialize JVM with BChemXtract JAR and create thread pool,
             then run Alembic migrations to ensure DB schema is current.
    Shutdown: Shut down thread pool (JVM shutdown is skipped -- irreversible).

    Raises:
        JVMStartupError: If JVM fails to start (fatal -- app exits, Docker restarts).
    """
    initialize_jvm(settings)
    await _run_migrations()
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
            "Export selected substances or an entire extraction in seven "
            "formats: SDF, JSON, CSV, PNG, SVG, CML, MDL V3000."
        ),
    },
    {
        "name": "health",
        "description": "Liveness and detailed JVM diagnostics.",
    },
]


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    Returns:
        Configured FastAPI instance with CORS middleware, unified
        exception handlers (D-17), curated OpenAPI metadata (D-16),
        and Redoc mounted at /redoc alongside the default /docs.
    """
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
    )

    # D-17 (Plan 09-05): unified ErrorResponse handlers. Order of registration
    # does not matter — FastAPI dispatches by exception type. The BridgeError
    # handler must remain the single registered handler for that class
    # (Pitfall 7) to avoid a second add_exception_handler overwriting it.
    application.add_exception_handler(HTTPException, http_exception_handler)
    application.add_exception_handler(
        RequestValidationError, validation_exception_handler
    )
    application.add_exception_handler(BridgeError, bridge_error_handler)
    application.add_exception_handler(Exception, unhandled_exception_handler)

    # CORS middleware -- allows frontend dev server access
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    application.include_router(health.router, prefix="/api")
    application.include_router(extract.router, prefix="/api")
    application.include_router(history.router, prefix="/api")
    application.include_router(batch.router, prefix="/api")
    application.include_router(export.router, prefix="/api")
    application.include_router(reactions.router, prefix="/api")
    application.include_router(search.router, prefix="/api")

    # D-16 (Plan 09-05): Redoc at /redoc alongside the default Swagger
    # at /docs. FastAPI already serves Redoc by default, but we override
    # to customize the title and pin the openapi_url explicitly.
    @application.get("/redoc", include_in_schema=False)
    async def custom_redoc_html() -> HTMLResponse:
        return get_redoc_html(
            openapi_url=application.openapi_url or "/openapi.json",
            title=f"{application.title} — API Reference",
        )

    return application


app = create_app()
