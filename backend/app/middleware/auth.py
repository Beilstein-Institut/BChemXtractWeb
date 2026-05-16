"""API-key authentication dependency.

Two co-existing authentication paths during the Phase 11 Wave 3 cutover:

1. **Legacy Bearer** (Plan SEC-1): ``Authorization: Bearer <key>`` matched
   against :attr:`Settings.api_keys` using ``hmac.compare_digest``. This is
   the historical path; Plan 11-05 removes it in one diff.

2. **X-API-Key against ``api_keys`` table** (Phase 11 D-10): the new
   single-path identity model. The header value is PBKDF2-hashed and
   looked up against the ``api_keys`` table (admin-issued, revocable,
   expiring). First-use of a freshly-minted key emits
   ``auth.api_key.used.first`` via a background audit task (D-16).

The dependency checks X-API-Key first. On miss, it falls through to
Bearer for compatibility with the existing test fixture + frontend
proxy header. After Plan 11-05, the Bearer path is gone and the
fallback chain collapses to "X-API-Key required".

Design notes:

- **Constant-time compare** for Bearer via :func:`hmac.compare_digest`
  to avoid timing oracles when keys are long random strings.
- **401 instead of 403** on missing/invalid credentials — 403 is reserved
  for "authenticated but forbidden" (future role-based authorisation).
- **WWW-Authenticate challenge** on 401 per RFC 6750 §3.
"""

from __future__ import annotations

import hmac
import logging
from typing import Annotated

from fastapi import BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.db import get_db

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


def _check_bearer(presented: str) -> bool:
    """Constant-time lookup of ``presented`` against :attr:`Settings.api_keys`."""
    return any(
        hmac.compare_digest(candidate, presented) for candidate in settings.api_keys
    )


async def require_api_key(
    request: Request,
    background_tasks: BackgroundTasks,
    credentials: _BearerCreds,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """FastAPI dependency enforcing a valid API key (Bearer OR X-API-Key).

    Order of evaluation:
      1. If ``X-API-Key`` is present, validate it against the ``api_keys``
         table (Phase 11 D-10). On match, emit ``auth.api_key.used.first``
         on first observed use and return.
      2. Else, fall through to the legacy Bearer check against
         :attr:`Settings.api_keys`. Plan 11-05 deletes this branch.

    Raises:
        HTTPException: 401 on missing / malformed / invalid credentials.
    """
    # Path 1: X-API-Key against api_keys table (Phase 11 D-10).
    x_api_key = request.headers.get("X-API-Key")
    if x_api_key:
        # Local import — app.core.security imports app.config which
        # imports this module's siblings.
        from app.core.security import validate_api_key

        row = await validate_api_key(
            x_api_key,
            db,
            background_tasks=background_tasks,
            request=request,
        )
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key.",
                headers={"WWW-Authenticate": 'ApiKey realm="bchemxtract"'},
            )
        return

    # Path 2: legacy Bearer against Settings.api_keys (deleted by Plan 11-05).
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

    if not _check_bearer(credentials.credentials):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
            headers={
                "WWW-Authenticate": (
                    'Bearer realm="bchemxtract", error="invalid_token"'
                ),
            },
        )
