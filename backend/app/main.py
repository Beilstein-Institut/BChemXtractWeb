"""FastAPI application factory with lifespan and CORS configuration.

The app factory pattern allows flexible instantiation for both
production (uvicorn) and testing (httpx.AsyncClient) contexts.
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import health


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler.

    Startup: Initialize resources (JVM startup will be added in Phase 2).
    Shutdown: Clean up resources.
    """
    # TODO: Phase 2 -- initialize JVM via jpype.startJVM() here
    yield
    # TODO: Phase 2 -- JVM cleanup (if needed) here


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
