"""GDPR Article 17 hard-delete endpoint (Phase 11 D-14 / D-15).

``DELETE /api/me/data`` drops the caller's extractions, cascades to the
join tables (FK CASCADE), inline orphan-sweeps substances + reactions,
inserts an audit_log entry, clears the cookie, returns 204. All in one
transaction — no soft-delete, no retention window.

The atomic-audit (in-transaction, not background) is the RESEARCH
Pitfall #6 resolution: ``data.deleted`` must land or the deletion must
roll back. Routine audit events use background tasks via
``audit_log_insert``.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.session import SESSION_COOKIE
from app.models.chemistry import ErrorResponse
from app.models.orm import (
    Extraction,
    ExtractionReaction,
    ExtractionSubstance,
    Reaction,
    Substance,
)
from app.services.audit import audit_log_insert_in_session
from app.services.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.delete(
    "/me/data",
    status_code=204,
    operation_id="deleteMyData",
    summary="GDPR Article 17 — erase all data for this session",
    description=(
        "Hard-deletes the caller's extractions (cascading to join tables) "
        "and sweeps orphaned substances + reactions. Inserts an audit_log "
        "entry in the same transaction. Clears `bcx_sid` on the response. "
        "Returns 204."
    ),
    responses={
        204: {"description": "Erased."},
        500: {
            "model": ErrorResponse,
            "description": (
                "Internal error — transaction rolled back atomically (Pitfall #6)."
            ),
        },
    },
    tags=["me"],
)
async def delete_my_data(
    request: Request,
    response: Response,
    db: DbDep,
) -> Response:
    """Hard-delete every row owned by the caller's scope.

    Order of operations:
      1. DELETE FROM extractions WHERE session_id = :sid OR api_key_hash = :akh
         (cascades to extraction_substances + extraction_reactions).
      2. Orphan-sweep substances + reactions (D-15).
      3. In-transaction ``data.deleted`` audit insert (Pitfall #6 — if
         this fails, the deletion rolls back atomically).
      4. Commit.
      5. Clear ``bcx_sid`` on the response.
    """
    # request.state.scope was set by get_scoped_db in main.py's global
    # protected dep list. me.router is in that list (Task 4.4 below).
    session_id, api_key_hash = (
        request.state.scope if hasattr(request.state, "scope") else (None, None)
    )

    # 1. Delete extractions owned by the caller. RLS already filters reads
    #    to the caller's rows; the explicit OR predicate is defence in depth
    #    and mirrors D-02 policy semantics.
    await db.execute(
        delete(Extraction).where(
            (Extraction.session_id == session_id)
            | (Extraction.api_key_hash == api_key_hash)
        )
    )
    await db.flush()

    # 2. Inline orphan sweep (D-15) — same pattern as
    #    services/persistence.delete_extraction_by_id.
    await db.execute(
        delete(Substance).where(
            Substance.id.not_in(select(ExtractionSubstance.substance_id))
        )
    )
    await db.execute(
        delete(Reaction).where(
            Reaction.id.not_in(select(ExtractionReaction.reaction_id))
        )
    )

    # 3. Audit log — IN-TRANSACTION (Pitfall #6: data.deleted must be
    #    atomic with the deletion; if the audit insert fails, the
    #    deletion rolls back).
    await audit_log_insert_in_session(
        db,
        event="data.deleted",
        session_id=session_id,
        api_key_hash=api_key_hash,
        target_id=session_id or (api_key_hash.hex() if api_key_hash else None),
        request=request,
        meta={},
    )

    await db.commit()

    # 4. Clear cookie. Path MUST match the set path or browsers create a
    #    second cookie instead of expiring the first. Starlette strips
    #    Set-Cookie when a handler returns a fresh Response(204), so we
    #    use the same hand-off pattern as routers/auth.post_auth_restore:
    #    set the cookie on the FastAPI-injected ``response`` argument,
    #    then copy the header onto a new Response(204) (Plan 11-03
    #    Deviation #1).
    response.set_cookie(
        key=SESSION_COOKIE,
        value="",
        max_age=0,
        path="/",
        httponly=True,
        samesite="lax",
    )
    out = Response(status_code=204)
    out.headers["set-cookie"] = response.headers.get("set-cookie", "")
    return out
