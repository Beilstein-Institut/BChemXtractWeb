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

import logging
import os
from collections.abc import AsyncGenerator

from fastapi import BackgroundTasks, HTTPException, Request, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level engine — created once at import time.
# expire_on_commit=False: prevents lazy-load failures in async context.
engine = create_async_engine(settings.database_url, echo=settings.debug)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def assert_rls_enforceable() -> None:
    """Refuse to start if the runtime DB role bypasses RLS.

    Postgres skips RLS for any role with ``rolsuper=true`` or
    ``rolbypassrls=true`` even when ``FORCE ROW LEVEL SECURITY`` is on,
    so the runtime role must have both off — otherwise every cookie
    session can read every other session's data. The 2026_05_16
    migration creates ``bchemxtract_app`` (NOSUPERUSER NOBYPASSRLS) for
    exactly this; docker-compose connects backend / celery as that role.

    Escape hatch: ``ALLOW_SUPERUSER_DB=true`` downgrades a failed probe
    to a logged warning. This exists for two narrow paths:
      * pytest against a single shared test DB where role separation
        would multiply container churn for no security gain (the test
        suite verifies RLS *wiring* — set_rls_context calls, scope
        threading — not policy enforcement; that is covered end-to-end
        by Playwright against the production-shape docker-compose stack).
      * One-shot admin / migration scripts run by hand against the real
        DB as the bootstrap superuser.
    Production deployments NEVER set this var.

    Raises:
        RuntimeError: ``current_user`` has SUPERUSER or BYPASSRLS, or
            is not in ``pg_roles`` (RLS enforceability unverifiable).
            Suppressed (logged as warning) when ALLOW_SUPERUSER_DB=true.
    """
    allow_superuser = os.environ.get("ALLOW_SUPERUSER_DB", "").lower() == "true"
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles "
                "WHERE rolname = current_user"
            )
        )
        row = result.first()
    if row is None:
        msg = (
            "DB startup probe: current_user not in pg_roles. "
            "RLS enforceability cannot be verified."
        )
        if allow_superuser:
            logger.warning("%s ALLOW_SUPERUSER_DB=true — continuing.", msg)
            return
        raise RuntimeError(msg + " Refusing to start.")
    if row.rolsuper or row.rolbypassrls:
        msg = (
            f"DB role '{row.rolname}' has rolsuper={row.rolsuper} "
            f"rolbypassrls={row.rolbypassrls}. Postgres bypasses RLS for "
            "this role regardless of FORCE ROW LEVEL SECURITY."
        )
        if allow_superuser:
            logger.warning("%s ALLOW_SUPERUSER_DB=true — continuing.", msg)
            return
        raise RuntimeError(
            "Refusing to start: "
            + msg
            + " Update DATABASE_URL to connect as the bchemxtract_app role "
            "(2026_05_16_create_app_role migration)."
        )
    logger.info(
        "RLS startup probe passed: DB role '%s' has rolsuper=%s rolbypassrls=%s",
        row.rolname,
        row.rolsuper,
        row.rolbypassrls,
    )


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
    background_tasks: BackgroundTasks,
) -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: get_db + X-API-Key validation + RLS context + cookie.

    Order of operations (Phase 11 D-03 + Plan 11-05 cutover):
      1. Open AsyncSession.
      2. If ``X-API-Key`` header is present: validate against the
         ``api_keys`` table via ``validate_api_key``. Unknown / revoked
         / expired key → raise 401 (post-Plan-11-05 the cookie middleware
         is the only validator left for X-API-Key; an unvalidated path
         would let callers tag writes with a hash that has no api_keys
         row, breaking auditability + revocation). On match, emit
         ``auth.api_key.used.first`` once per key (D-16). Use the
         validated key's hash for RLS scope.
      3. Else if a valid ``bcx_sid`` cookie is present: scope by it.
      4. Else (anonymous): mint a fresh cookie AND scope to it.
      5. Issue ``set_config('app.session_id', ...)`` and
         ``set_config('app.api_key_hash', ...)`` on the session — these
         are the first execute() calls so the transaction starts here
         and the settings are transaction-local.
      6. Stash the resolved scope on ``request.state.scope`` so
         persistence writes can thread the owner columns through to
         ``save_extraction`` / ``save_reactions`` /
         ``get_or_create_extraction_row``.
      7. Yield the session for the route handler.

    Plan 11-04 added CSRF verification ahead of this dependency (separate
    middleware). Plan 11-05 deleted the legacy Bearer-token surface and
    folded X-API-Key validation in here.
    """
    # Local import to avoid the import-time circular dep with app.core.session
    # which imports app.core.security which imports app.models.orm.ApiKey
    # which imports app.models.orm.Base which we already own here.
    from app.core.security import validate_api_key
    from app.core.session import (
        _UUID_RE,
        SESSION_COOKIE,
        ensure_session_cookie,
        set_rls_context,
    )

    async with AsyncSessionLocal() as session:
        session_id: str | None = None
        api_key_hash: bytes | None = None

        api_key = request.headers.get("X-API-Key")
        if api_key:
            row = await validate_api_key(
                api_key,
                session,
                background_tasks=background_tasks,
                request=request,
            )
            if row is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid API key.",
                    headers={"WWW-Authenticate": 'ApiKey realm="bchemxtract"'},
                )
            api_key_hash = row.key_hash
        else:
            sid = request.cookies.get(SESSION_COOKIE)
            if sid and _UUID_RE.match(sid):
                session_id = sid
            else:
                session_id = ensure_session_cookie(response, request)

        await set_rls_context(session, session_id, api_key_hash)
        request.state.scope = (session_id, api_key_hash)
        yield session
