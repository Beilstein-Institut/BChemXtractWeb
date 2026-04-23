"""API-key bearer-token authentication.

Every ``/api/*`` router except the minimal ``GET /api/health`` is protected
by :func:`require_api_key`, which validates an ``Authorization: Bearer <key>``
header against :attr:`Settings.api_keys` using a constant-time compare.

Design choices:

1. **Bearer scheme** rather than ``X-API-Key`` so migrating to JWT/OIDC later
   does not require changing client code.
2. **Constant-time compare** via :func:`hmac.compare_digest` to avoid timing
   oracles when keys are long random strings.
3. **401 instead of 403** on missing/invalid credentials — 403 is reserved
   for "authenticated but forbidden" (future role-based authorisation).
4. **WWW-Authenticate challenge** on 401 per RFC 6750 §3.
"""

from __future__ import annotations

import hmac
import logging
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

logger = logging.getLogger(__name__)

# `auto_error=False` so we can emit a 401 with a correct WWW-Authenticate
# challenge instead of HTTPBearer's default 403.
_bearer_scheme = HTTPBearer(
    bearerFormat="API key",
    auto_error=False,
    description=(
        "Send your API key as a Bearer token: "
        "`Authorization: Bearer <key>`. Keys are provisioned via the "
        "`API_KEYS` environment variable."
    ),
)

_BearerCreds = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)]


def _check_key(presented: str) -> bool:
    """Constant-time lookup of ``presented`` against :attr:`Settings.api_keys`."""
    return any(
        hmac.compare_digest(candidate, presented) for candidate in settings.api_keys
    )


async def require_api_key(credentials: _BearerCreds) -> None:
    """FastAPI dependency enforcing a valid bearer API key.

    Raises:
        HTTPException: 401 on missing / malformed / invalid credentials.

    Notes:
        When :attr:`Settings.debug` is true and :attr:`Settings.api_keys` is
        empty, the dependency is a no-op so local development does not
        require a key. Startup validation (``_validate_api_keys``) makes this
        combination impossible in production.
    """
    if not settings.api_keys:
        if settings.debug:
            return
        # Defensive — the settings validator already refuses this
        # combination, but belt-and-braces for runtime mutation.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server misconfigured: no API keys provisioned.",
        )

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header.",
            headers={"WWW-Authenticate": 'Bearer realm="bchemxtract"'},
        )

    if not _check_key(credentials.credentials):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
            headers={
                "WWW-Authenticate": (
                    'Bearer realm="bchemxtract", error="invalid_token"'
                ),
            },
        )
