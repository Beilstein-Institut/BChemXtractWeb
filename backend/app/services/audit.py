"""Audit-log writer (Phase 11 D-16).

Two patterns:
- ``audit_log_insert``: opens a FRESH AsyncSession, never blocks the
  parent request. Use with FastAPI ``BackgroundTasks`` for routine events
  (``auth.session.created``, ``auth.api_key.created``, etc.).
- ``audit_log_insert_in_session``: writes via the CALLER's session (in
  the same transaction). Use ONLY for ``data.deleted`` (GDPR Article 17)
  where the audit record must land or the deletion must roll back
  atomically (RESEARCH §Pitfall #6).

``session_id`` values are sha256-hashed (32 bytes) BEFORE storage so the
audit log itself is not a credential leak (D-22 / T-11-07).
"""

from __future__ import annotations

import hashlib
import logging

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import AuditLog
from app.services.db import AsyncSessionLocal

logger = logging.getLogger(__name__)


def _hash_session_id(session_id: str | None) -> bytes | None:
    """Return sha256(session_id) bytes, or None for empty/missing input."""
    if not session_id:
        return None
    return hashlib.sha256(session_id.encode()).digest()


async def audit_log_insert(
    event: str,
    session_id: str | None,
    api_key_hash: bytes | None,
    target_id: str | None,
    request: Request | None,
    meta: dict | None = None,
) -> None:
    """Fire-and-forget audit insert. Failures log a warning but never raise.

    Suitable for ``BackgroundTasks``. Opens its own DB session so the
    caller's transaction is unaffected.
    """
    try:
        ip = request.client.host if request and request.client else None
        ua = request.headers.get("user-agent") if request else None
        async with AsyncSessionLocal() as db:
            row = AuditLog(
                session_id_hash=_hash_session_id(session_id),
                api_key_hash=api_key_hash,
                ip_inet=ip,
                user_agent=ua,
                event=event,
                target_id=target_id,
                meta=meta or {},
            )
            db.add(row)
            await db.commit()
    except Exception as e:  # noqa: BLE001 — best-effort audit per D-16
        logger.warning("audit_log insert failed: event=%s err=%s", event, e)


async def audit_log_insert_in_session(
    db: AsyncSession,
    event: str,
    session_id: str | None,
    api_key_hash: bytes | None,
    target_id: str | None,
    request: Request | None,
    meta: dict | None = None,
) -> None:
    """In-transaction audit insert. Raises on failure — used by
    ``data.deleted`` so the GDPR delete and audit record are atomic
    (Pitfall #6).
    """
    ip = request.client.host if request and request.client else None
    ua = request.headers.get("user-agent") if request else None
    row = AuditLog(
        session_id_hash=_hash_session_id(session_id),
        api_key_hash=api_key_hash,
        ip_inet=ip,
        user_agent=ua,
        event=event,
        target_id=target_id,
        meta=meta or {},
    )
    db.add(row)
    await db.flush()
