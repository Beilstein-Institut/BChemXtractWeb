"""Crypto primitives for auth (PBKDF2, admin secret, CSRF token,
api_key validation). Lifted from ChemAudit security.py with one structural
divergence: validate_api_key reads from Postgres (this repo), not Redis
(ChemAudit).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import time
from datetime import UTC, datetime, timedelta
from functools import lru_cache

from fastapi import BackgroundTasks, HTTPException, Request, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

logger = logging.getLogger(__name__)

admin_secret_header = APIKeyHeader(name="X-Admin-Secret", auto_error=False)


@lru_cache(maxsize=512)
def hash_api_key_for_lookup(api_key_plain: str) -> str:
    """PBKDF2-HMAC-SHA256 lookup hash. Deterministic (SECRET_KEY = fixed salt).

    OWASP 2026: 600k iterations minimum. Per-worker @lru_cache amortises
    the ~100-200ms cost — first call slow, subsequent O(1).
    Returns 64-char hex string (32 bytes).
    """
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        api_key_plain.encode(),
        settings.secret_key.encode(),
        iterations=600_000,
        dklen=32,
    )
    return dk.hex()


def calculate_expiry_date(expiry_days: int | None = None) -> datetime | None:
    """Compute expires_at for a new API key. None/0 means no expiry.

    Values above Settings.api_key_max_expiry_days (365) are clamped.
    Returns timezone-aware datetime in UTC, or None for non-expiring.
    """
    if expiry_days is None:
        expiry_days = settings.api_key_default_expiry_days
    if expiry_days <= 0:
        return None
    expiry_days = min(expiry_days, settings.api_key_max_expiry_days)
    return datetime.now(UTC) + timedelta(days=expiry_days)


async def require_admin_auth(
    admin_secret: str | None = Security(admin_secret_header),
) -> bool:
    """FastAPI dependency: enforce X-Admin-Secret header.
    Constant-time compare via secrets.compare_digest.
    """
    if not admin_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required",
            headers={"WWW-Authenticate": "AdminSecret"},
        )
    if not secrets.compare_digest(admin_secret, settings.admin_secret):
        logger.warning("Failed admin authentication attempt")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
            headers={"WWW-Authenticate": "AdminSecret"},
        )
    return True


def generate_csrf_token(session_id: str = "") -> str:
    """HMAC-bound CSRF token with session-binding.

    Shape: random_bytes_hex.timestamp.signature
    Signature: HMAC-SHA256(SECRET_KEY, random_bytes + timestamp + session_id)

    session_id is folded into the HMAC input so a token issued for session A
    cannot be replayed against session B.
    """
    random_bytes = secrets.token_bytes(32)
    timestamp = str(int(time.time())).encode()
    signature = hmac.new(
        settings.secret_key.encode(),
        random_bytes + timestamp + session_id.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{random_bytes.hex()}.{timestamp.decode()}.{signature}"


def verify_csrf_token(
    token: str,
    session_id: str = "",
    max_age_seconds: int = 3600,
) -> bool:
    """Constant-time verify of a CSRF token. False on any failure."""
    if not token:
        return False
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return False
        random_hex, timestamp_str, provided_signature = parts
        timestamp = int(timestamp_str)
        if time.time() - timestamp > max_age_seconds:
            return False
        random_bytes = bytes.fromhex(random_hex)
        expected_signature = hmac.new(
            settings.secret_key.encode(),
            random_bytes + timestamp_str.encode() + session_id.encode(),
            hashlib.sha256,
        ).hexdigest()
        return secrets.compare_digest(provided_signature, expected_signature)
    except (ValueError, TypeError):
        return False


async def validate_api_key(
    api_key: str,
    db: AsyncSession,
    background_tasks: BackgroundTasks | None = None,
    request: Request | None = None,
):
    """Validate an X-API-Key plaintext against the api_keys table.

    Returns the row on success, None on failure (unknown, revoked,
    expired). Updates ``last_used_at`` + ``request_count`` on success.
    Emits ``auth.api_key.used.first`` EXACTLY once per key — the call
    where ``last_used_at`` transitions from NULL → now().

    The audit emit is gated on ``background_tasks is not None`` so
    direct-call unit tests (which bypass FastAPI's request lifecycle)
    can validate keys without an audit hook.
    """
    from app.models.orm import ApiKey  # local import — circular dep

    key_hash_hex = hash_api_key_for_lookup(api_key)
    key_hash_bytes = bytes.fromhex(key_hash_hex)
    result = await db.execute(select(ApiKey).where(ApiKey.key_hash == key_hash_bytes))
    row = result.scalar_one_or_none()
    if row is None:
        return None
    if row.revoked_at is not None:
        return None
    if row.expires_at is not None and datetime.now(UTC) > row.expires_at:
        return None

    is_first_use = row.last_used_at is None
    row.last_used_at = datetime.now(UTC)
    row.request_count = (row.request_count or 0) + 1
    await db.commit()

    if is_first_use and background_tasks is not None:
        # Local import — app.services.audit imports app.models.orm which
        # transitively imports app.core.security, so the top-level import
        # would cycle.
        from app.services.audit import audit_log_insert

        background_tasks.add_task(
            audit_log_insert,
            event="auth.api_key.used.first",
            session_id=None,
            api_key_hash=row.key_hash,
            target_id=str(row.id),
            request=request,
            meta={"name": row.name},
        )

    return row
