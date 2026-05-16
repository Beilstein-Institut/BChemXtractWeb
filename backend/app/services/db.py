"""Async database engine, session factory, and FastAPI dependency (Phase 5).

Single source of truth for DB connectivity. The engine is module-level;
the session factory is reused for every request via get_db().

Phase 11 adds ``get_scoped_db``: a sibling dependency that opens a fresh
``AsyncSession``, resolves the request's (session_id, api_key_hash) scope,
auto-issues the ``bcx_sid`` cookie when neither is present, sets the
Postgres RLS context variables via ``set_config``, and stashes the
resolved scope onto ``request.state.scope`` so router handlers can thread
it into persistence writes (D-01/D-03). ``get_db`` is left untouched so
migration helpers, ORM unit tests, and the Celery worker — which run
without a FastAPI request context — keep their un-scoped session source.

JVM note: DB layer is pure asyncio — no JPype interaction, no thread pool.
"""

from collections.abc import AsyncGenerator

from fastapi import Request, Response
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


async def get_scoped_db(
    request: Request,
    response: Response,
) -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: get_db + RLS context-setting + cookie issuance.

    Order of operations (Phase 11 D-03):
      1. Open AsyncSession.
      2. Resolve (session_id, api_key_hash) via get_data_scope.
      3. If neither — browser first visit — mint a fresh bcx_sid cookie
         AND set session_id to the new UUID.
      4. Issue set_config('app.session_id', ...) and
         set_config('app.api_key_hash', ...) on the session — these are
         the first execute() calls so the transaction starts here and the
         settings are transaction-local.
      5. Stash the resolved scope on request.state.scope so persistence
         writes can thread the owner columns through to ``save_extraction``
         / ``save_reactions`` / ``get_or_create_extraction_row``.
      6. Yield the session for the route handler.

    Plan 11-04 adds CSRF verification ahead of this dependency (separate
    middleware). Plan 11-05 removes the legacy require_api_key.
    """
    # Local import to avoid the import-time circular dep with app.core.session
    # which imports app.core.security which imports app.models.orm.ApiKey
    # which imports app.models.orm.Base which we already own here.
    from app.core.session import (
        ensure_session_cookie,
        get_data_scope,
        set_rls_context,
    )

    async with AsyncSessionLocal() as session:
        session_id, api_key_hash = await get_data_scope(request)
        if session_id is None and api_key_hash is None:
            session_id = ensure_session_cookie(response, request)
        await set_rls_context(session, session_id, api_key_hash)
        request.state.scope = (session_id, api_key_hash)
        yield session
