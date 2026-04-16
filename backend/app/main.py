"""FastAPI application factory with lifespan and CORS configuration.

The app factory pattern allows flexible instantiation for both
production (uvicorn) and testing (httpx.AsyncClient) contexts.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.errors import BridgeError, bridge_error_handler
from app.routers import batch, export, extract, health, history
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


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    Returns:
        Configured FastAPI instance with CORS middleware and routers.
    """
    application = FastAPI(
        title="BChemXtract Web API",
        description="Extract chemical structures and reactions from ChemDraw files",
        version="0.1.0",
        lifespan=lifespan,
    )

    # Bridge error handler -- maps BridgeError subtypes to HTTP status codes
    application.add_exception_handler(BridgeError, bridge_error_handler)

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

    return application


app = create_app()
