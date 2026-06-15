"""Admin CRUD over api_keys table.

X-Admin-Secret gate via require_admin_auth. Rate-limited 5/minute per IP
(admin requests carry no cookie, so the global key_func — which prefers
session id, then API-key hash, then IP — falls back to
get_remote_address).
"""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    calculate_expiry_date,
    hash_api_key_for_lookup,
    require_admin_auth,
)
from app.middleware.rate_limit import limiter
from app.models.auth import (
    ApiKeyCreate,
    ApiKeyCreatedResponse,
    ApiKeyInfo,
)
from app.models.chemistry import ErrorResponse
from app.models.orm import ApiKey
from app.services.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post(
    "/api-keys",
    response_model=ApiKeyCreatedResponse,
    status_code=201,
    operation_id="adminCreateApiKey",
    summary="Mint a new API key (admin)",
    description=(
        "Generates a `bcx_<base64url(32)>` key, stores its PBKDF2 "
        "lookup hash, and returns the plaintext key ONCE. Subsequent list/revoke "
        "endpoints never expose the plaintext. Default expiry 90 days "
        "(`expiry_days = 0` → no expiry)."
    ),
    dependencies=[Depends(require_admin_auth)],
    responses={
        201: {"description": "Key created."},
        401: {"model": ErrorResponse, "description": "Missing/invalid admin secret."},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded."},
    },
    tags=["admin"],
)
@limiter.limit("5/minute")
async def create_api_key(
    request: Request,
    body: ApiKeyCreate,
    background: BackgroundTasks,
    db: DbDep,
) -> ApiKeyCreatedResponse:
    """Mint a key. Returns plaintext ONCE; persists PBKDF2 hash only."""
    plaintext = "bcx_" + secrets.token_urlsafe(32)
    key_hash_hex = hash_api_key_for_lookup(plaintext)
    expires_at = calculate_expiry_date(body.expiry_days)

    row = ApiKey(
        key_hash=bytes.fromhex(key_hash_hex),
        name=body.name,
        description=body.description or "",
        expires_at=expires_at,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    from app.services.audit import audit_log_insert

    background.add_task(
        audit_log_insert,
        event="auth.api_key.created",
        session_id=None,
        api_key_hash=None,
        target_id=str(row.id),
        request=request,
        meta={"name": row.name},
    )

    return ApiKeyCreatedResponse(
        key=plaintext,
        key_id=row.id,
        name=row.name,
        description=row.description,
        created_at=row.created_at,
        expires_at=row.expires_at,
    )


@router.get(
    "/api-keys",
    response_model=list[ApiKeyInfo],
    operation_id="adminListApiKeys",
    summary="List API keys (metadata only, no plaintext)",
    dependencies=[Depends(require_admin_auth)],
    responses={
        200: {"description": "List of keys."},
        401: {"model": ErrorResponse, "description": "Missing/invalid admin secret."},
    },
    tags=["admin"],
)
@limiter.limit("10/minute")
async def list_api_keys(request: Request, db: DbDep) -> list[ApiKeyInfo]:
    """List keys (metadata only — never returns plaintext)."""
    result = await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    rows = result.scalars().all()
    return [ApiKeyInfo.model_validate(r) for r in rows]


@router.delete(
    "/api-keys/{key_id}",
    status_code=204,
    operation_id="adminRevokeApiKey",
    summary="Revoke (soft-delete) an API key",
    description="Sets `revoked_at = now()`. Row is retained for audit history.",
    dependencies=[Depends(require_admin_auth)],
    responses={
        204: {"description": "Revoked."},
        404: {
            "model": ErrorResponse,
            "description": "key_id not found or already revoked.",
        },
        401: {"model": ErrorResponse, "description": "Missing/invalid admin secret."},
    },
    tags=["admin"],
)
@limiter.limit("5/minute")
async def revoke_api_key(
    request: Request,
    key_id: int,
    background: BackgroundTasks,
    db: DbDep,
) -> None:
    """Soft-revoke by setting revoked_at. 404 if not found or already revoked."""
    result = await db.execute(
        update(ApiKey)
        .where(ApiKey.id == key_id, ApiKey.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(
            status_code=404, detail="API key not found or already revoked"
        )

    from app.services.audit import audit_log_insert

    background.add_task(
        audit_log_insert,
        event="auth.api_key.revoked",
        session_id=None,
        api_key_hash=None,
        target_id=str(key_id),
        request=request,
        meta={},
    )
