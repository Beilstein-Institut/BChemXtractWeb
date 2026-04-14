"""Async database engine, session factory, and FastAPI dependency (Phase 5).

Single source of truth for DB connectivity. The engine is module-level;
the session factory is reused for every request via get_db().

JVM note: DB layer is pure asyncio — no JPype interaction, no thread pool.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

# Module-level engine — created once at import time.
# expire_on_commit=False: prevents lazy-load failures in async context.
engine = create_async_engine(settings.database_url, echo=settings.debug)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields one AsyncSession per request.

    Usage:
        DbDep = Annotated[AsyncSession, Depends(get_db)]

        @router.get("/history")
        async def list_history(db: DbDep) -> ...:
            ...
    """
    async with AsyncSessionLocal() as session:
        yield session
