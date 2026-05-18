"""Pydantic models for Phase 11 auth/session/admin/csrf surfaces.

All fields default to safe values (no None in response shapes) — same
discipline as backend/app/models/chemistry.py.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

# --- Session / recovery code ------------------------------------------------


class SessionInfoResponse(BaseModel):
    """Response shape of PUT /api/auth/me (D-23)."""

    session_id: str = ""
    has_history: bool = False


class RestoreRequest(BaseModel):
    """Body of POST /api/auth/restore (D-09).

    `code` must be a canonical lowercase UUID4. Validation runs at the
    Pydantic boundary so the router can rely on a clean value.
    """

    code: str

    @field_validator("code")
    @classmethod
    def _validate_uuid4(cls, v: str) -> str:
        import re

        pat = re.compile(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        )
        if not pat.match(v):
            raise ValueError("code must be a canonical lowercase UUID4")
        return v


# --- API keys ---------------------------------------------------------------


class ApiKeyCreate(BaseModel):
    """Body of POST /api/admin/api-keys (D-10, D-11, D-13)."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    expiry_days: int = Field(default=90, ge=0, le=365)


class ApiKeyCreatedResponse(BaseModel):
    """Returned ONCE on key creation; full plaintext only here (D-11)."""

    key: str = ""  # bcx_<base64url(32)>
    key_id: int = 0
    name: str = ""
    description: str = ""
    created_at: datetime
    expires_at: datetime | None = None


class ApiKeyInfo(BaseModel):
    """List-view shape — NEVER includes plaintext (D-11)."""

    id: int = 0
    name: str = ""
    description: str = ""
    created_at: datetime
    last_used_at: datetime | None = None
    request_count: int = 0
    expires_at: datetime | None = None
    revoked_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- CSRF -------------------------------------------------------------------


class CsrfTokenResponse(BaseModel):
    """Response shape of GET /api/csrf-token (D-19)."""

    csrf_token: str = ""
