"""FastAPI application factory with lifespan and CORS configuration.

The app factory pattern allows flexible instantiation for both
production (uvicorn) and testing (httpx.AsyncClient) contexts.
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.errors import BridgeError, bridge_error_handler
from app.routers import health
from app.services.jvm_bridge import initialize_jvm, shutdown_pool


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler.

    Startup: Initialize JVM with BChemXtract JAR and create thread pool.
    Shutdown: Shut down thread pool (JVM shutdown is skipped -- irreversible).

    Raises:
        JVMStartupError: If JVM fails to start (fatal -- app exits, Docker restarts).
    """
    initialize_jvm(settings)
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

    return application


app = create_app()
