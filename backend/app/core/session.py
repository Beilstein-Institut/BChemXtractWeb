"""Cookie-based session identity + RLS scope resolution.

Lifted from ChemAudit (github.com/Kohulan/ChemAudit/main/backend/app/core/session.py)
with three adaptations: cookie name bcx_sid; is_dev derived from
list[str] cors_origins; import path app.config.settings.

Discipline preserved verbatim:
- Strict UUID4 regex on inbound cookie before trust.
- Never echo user-supplied cookie into Set-Cookie (prevents fixation).
- set_config(..., true) for transaction-local RLS context.
"""

from __future__ import annotations

import logging
import re
import uuid

from fastapi import Request, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

logger = logging.getLogger(__name__)

SESSION_COOKIE = "bcx_sid"
SESSION_MAX_AGE = 30 * 24 * 3600  # 30 days

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)


def _is_dev_origin_set() -> bool:
    return any(
        "localhost" in origin or "127.0.0.1" in origin
        for origin in settings.cors_origins
    )


def get_session_id(request: Request) -> str | None:
    return request.cookies.get(SESSION_COOKIE)


def create_session_id() -> str:
    return str(uuid.uuid4())


def ensure_session_cookie(response: Response, request: Request) -> str:
    """Return existing valid sid OR mint a new one and set the cookie.
    Never echoes an attacker-supplied cookie value.
    """
    existing = request.cookies.get(SESSION_COOKIE)
    if existing and _UUID_RE.match(existing):
        return existing

    new_id = create_session_id()
    is_dev = _is_dev_origin_set()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=new_id,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=not is_dev,
        samesite="lax",
        path="/",
    )
    return new_id


async def get_data_scope(
    request: Request,
) -> tuple[str | None, bytes | None]:
    """Resolve (session_id, api_key_hash_bytes). API key wins over cookie."""
    from app.core.security import hash_api_key_for_lookup  # avoid circular

    api_key = request.headers.get("X-API-Key")
    if api_key:
        key_hash_hex = hash_api_key_for_lookup(api_key)
        return None, bytes.fromhex(key_hash_hex)

    sid = get_session_id(request)
    if sid and _UUID_RE.match(sid):
        return sid, None
    return None, None


async def set_rls_context(
    db: AsyncSession,
    session_id: str | None,
    api_key_hash: bytes | None,
) -> None:
    """Set Postgres session vars for RLS policy evaluation.

    set_config(name, value, true) is transaction-local. The bytea round-trips
    via hex string — the policy's ::bytea cast on NULLIF rewraps it.
    """
    await db.execute(
        text("SELECT set_config('app.session_id', :sid, true)"),
        {"sid": session_id or ""},
    )
    await db.execute(
        text("SELECT set_config('app.api_key_hash', :akh, true)"),
        {"akh": api_key_hash.hex() if api_key_hash else ""},
    )
