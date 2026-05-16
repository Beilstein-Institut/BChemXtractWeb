"""Cookie / recovery-code / CSRF-token routes (Phase 11 D-09 / D-19 / D-23).

These three endpoints are intentionally OUTSIDE the global scoped
dependency in ``main.py``: ``PUT /api/auth/me`` is the endpoint that
ISSUES the cookie (so it must run before ``set_rls_context`` could see
one), and the CSRF-token endpoint must be reachable without a CSRF
token. The router opens its own DB session via ``get_db`` (un-scoped)
and runs ``set_rls_context`` manually only where needed (the has_history
EXISTS query on PUT /auth/me, so the policy USING clause filters by the
caller's session).
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import generate_csrf_token
from app.core.session import (
    SESSION_COOKIE,
    SESSION_MAX_AGE,
    ensure_session_cookie,
    set_rls_context,
)
from app.models.auth import (
    CsrfTokenResponse,
    RestoreRequest,
    SessionInfoResponse,
)
from app.models.chemistry import ErrorResponse
from app.models.orm import Extraction
from app.services.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

DbDep = Annotated[AsyncSession, Depends(get_db)]


def _is_dev_origin_set() -> bool:
    """Mirror app.core.session._is_dev_origin_set for cookie ``secure`` flag.

    Inlined here so the auth router has zero coupling to ``session``'s
    private helper while still honouring the same dev-vs-prod cookie
    discipline (D-05).
    """
    return any(
        "localhost" in origin or "127.0.0.1" in origin
        for origin in settings.cors_origins
    )


@router.put(
    "/auth/me",
    response_model=SessionInfoResponse,
    operation_id="putAuthMe",
    summary="Bootstrap or refresh the current session",
    description=(
        "PUT (idempotent) is used because the operation is effectively "
        "upsert: when no cookie is present, the server mints one and "
        "sets `Set-Cookie`; when one is present, the response returns "
        "the same session_id without re-issuing the cookie. The "
        "`has_history` boolean drives the Settings UI empty state."
    ),
    responses={
        200: {"description": "Session id resolved or freshly minted."},
        500: {"model": ErrorResponse, "description": "Internal error."},
    },
    tags=["auth"],
)
async def put_auth_me(
    request: Request,
    response: Response,
    db: DbDep,
) -> SessionInfoResponse:
    """Bootstrap or refresh the caller's session (D-23).

    ``ensure_session_cookie`` returns the existing cookie value when it
    matches the canonical UUID4 regex, otherwise mints a fresh one and
    sets ``Set-Cookie``. The has_history EXISTS query runs under the
    RLS context for ``session_id`` so it cannot leak counts across
    scopes.
    """
    session_id = ensure_session_cookie(response, request)
    # set_rls_context locally so the EXISTS query honours RLS — this
    # endpoint is mounted outside the global scoped dependency.
    await set_rls_context(db, session_id, None)
    result = await db.execute(
        select(func.count(Extraction.id)).where(Extraction.session_id == session_id)
    )
    count = result.scalar_one()
    return SessionInfoResponse(session_id=session_id, has_history=count > 0)


@router.post(
    "/auth/restore",
    status_code=204,
    operation_id="postAuthRestore",
    summary="Restore a session from a recovery code (D-09)",
    description=(
        "Validates the pasted UUID4 and swaps `bcx_sid` to that value. "
        "No data merge — any data owned by the browser's previous "
        "anonymous session becomes unreachable in this browser (still "
        "in the DB until a separate GDPR delete or another restore)."
    ),
    responses={
        204: {"description": "Cookie swapped."},
        422: {"model": ErrorResponse, "description": "Invalid UUID4."},
    },
    tags=["auth"],
)
async def post_auth_restore(
    body: RestoreRequest,
    request: Request,
    response: Response,
    background: BackgroundTasks,
) -> Response:
    """Restore a session by pasting a recovery code (D-09).

    D-09 semantics: cookie swap, NOT data merge. The pasted UUID4 has
    already been validated by ``RestoreRequest.code``'s
    ``field_validator``; this handler simply echoes that validated
    value into the ``Set-Cookie`` header. Returning ``Response(204)``
    explicitly (rather than relying on FastAPI's ``status_code=204``)
    preserves the ``Set-Cookie`` header that Starlette would otherwise
    drop when a route returns ``None`` with a 204.
    """
    is_dev = _is_dev_origin_set()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=body.code,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=not is_dev,
        samesite="lax",
        path="/",
    )
    # Plan 11-04: background.add_task(_audit_log_insert,
    #     event="auth.session.restored", target_id=body.code, request=request)
    # Reference the BackgroundTasks param so static analysis sees it as
    # the intentional Plan 11-04 hook rather than dead code.
    _ = background
    # Surface the Set-Cookie header on a 204 by hand-building the
    # Response. Starlette strips it if we return None with status=204.
    out = Response(status_code=204)
    out.headers["set-cookie"] = response.headers.get("set-cookie", "")
    return out


@router.get(
    "/csrf-token",
    response_model=CsrfTokenResponse,
    operation_id="getCsrfToken",
    summary="Issue a CSRF token bound to the current session",
    description=(
        "Returns a session-bound HMAC token. Cookie-auth state-changing "
        "requests must echo this token in `X-CSRF-Token`. Token TTL = 1h; "
        "frontend refetches on 403/CSRF_INVALID."
    ),
    responses={200: {"description": "Token issued."}},
    tags=["auth"],
)
async def get_csrf_token(
    request: Request,
    response: Response,
) -> CsrfTokenResponse:
    """Mint a session-bound CSRF token (D-19).

    Auto-issues ``bcx_sid`` if absent so the token has a session_id to
    bind. Plan 11-04 wires the verification middleware that consumes
    this token on cookie-auth state-changing requests.
    """
    sid = ensure_session_cookie(response, request)
    token = generate_csrf_token(sid)
    return CsrfTokenResponse(csrf_token=token)
