"""Exception hierarchy for the JPype bridge layer + unified error handlers.

All bridge-layer errors inherit from BridgeError, which provides a
consistent interface (message + optional detail) and maps to HTTP
status codes via the FastAPI exception handler at the bottom of this
module.

Per D-17 (Plan 09-05), all 4xx/5xx responses across /api/* emit a
unified :class:`ErrorResponse` shape ``{detail, code, fields?}`` — never
the legacy ``{"error": ...}`` shape. Four global handlers cover every
error source:

- :func:`http_exception_handler` — :class:`HTTPException` raised by any
  router (maps ``status_code`` → ``code``).
- :func:`validation_exception_handler` —
  :class:`RequestValidationError` from Pydantic (populates ``fields``).
- :func:`bridge_error_handler` — :class:`BridgeError` subclasses from
  the JVM/JPype layer (maps exception class → status + stable code).
- :func:`unhandled_exception_handler` — catch-all; logs the full trace
  server-side and emits a generic body. Also special-cases
  :class:`TimeoutError` from ``run_in_jvm_thread`` → 503 / JVM_TIMEOUT.

Exception tree:
    BridgeError
    +-- FileSizeError              (413 FILE_TOO_LARGE)
    +-- JVMStartupError            (503 JVM_UNAVAILABLE)
    +-- FormatDetectionError       (415 UNSUPPORTED_FORMAT)
    +-- ExtractionError            (422 EXTRACTION_FAILED)
    +-- NullFieldError             (500 NULL_FIELD)
    +-- InvalidSmartsError         (422 INVALID_SMARTS)
    +-- InvalidInchiKeyError       (422 INVALID_INCHI_KEY)
    +-- InvalidSmilesError         (422 INVALID_SMILES)
    +-- InvalidQueryError          (422 INVALID_QUERY)
    +-- QueryTooLargeError         (422 QUERY_TOO_LARGE)
    +-- CSRFValidationError        (403 CSRF_INVALID)            [Phase 11]
    +-- InvalidSessionCodeError    (422 INVALID_SESSION_CODE)    [Phase 11]
    +-- InvalidAdminSecretError    (401 INVALID_ADMIN_SECRET)    [Phase 11]
    +-- ApiKeyExpiredError         (401 API_KEY_EXPIRED)         [Phase 11]
    +-- ApiKeyRevokedError         (401 API_KEY_REVOKED)         [Phase 11]
"""

import logging

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.models.chemistry import ErrorResponse


class BridgeError(Exception):
    """Base exception for JPype bridge layer errors."""

    def __init__(self, message: str, detail: str | None = None) -> None:
        super().__init__(message)
        self.detail = detail


class JVMStartupError(BridgeError):
    """JVM failed to start -- fatal, app should exit."""


class FormatDetectionError(BridgeError):
    """File format not recognized as CDX or CDXML."""


class ExtractionError(BridgeError):
    """Java extraction process failed."""


class NullFieldError(BridgeError):
    """Unexpected null in a required Java field."""


class FileSizeError(BridgeError):
    """Uploaded file exceeds the size limit."""


# ----------------------------------------------------------------------------
# Phase 9: Search-domain BridgeError subclasses (Plan 03). Map to 422 + stable
# codes via bridge_error_handler below.
# ----------------------------------------------------------------------------


class InvalidSmartsError(BridgeError):
    """User-supplied SMARTS pattern is malformed (422 / INVALID_SMARTS)."""


class InvalidInchiKeyError(BridgeError):
    """User-supplied InChI key fails the 14-10-1 shape (422 / INVALID_INCHI_KEY)."""


class InvalidSmilesError(BridgeError):
    """User-supplied SMILES can't be parsed by CDK (422 / INVALID_SMILES)."""


class InvalidQueryError(BridgeError):
    """User-supplied substructure query (SMILES or SMARTS) can't be parsed
    (422 / INVALID_QUERY)."""


class QueryTooLargeError(BridgeError):
    """Parsed substructure query exceeds the atom-count ceiling
    (422 / QUERY_TOO_LARGE). Guards against pathological queries like
    a 500-atom SMARTS pattern that would stall enumeration."""


# ----------------------------------------------------------------------------
# Phase 11: auth + CSRF + admin BridgeError subclasses (D-13 / Plan 09 unified
# ErrorResponse shape). Each gets a stable code in _BRIDGE_ERROR_MAP below.
# ----------------------------------------------------------------------------


class CSRFValidationError(BridgeError):
    """CSRF token missing, tampered, expired, or session-mismatched
    (403 / CSRF_INVALID). Threat ref: T-11-09."""


class InvalidSessionCodeError(BridgeError):
    """POST /api/auth/restore received a non-UUID4 value (422 / INVALID_SESSION_CODE).
    Threat ref: T-11-15."""


class InvalidAdminSecretError(BridgeError):
    """X-Admin-Secret missing or mismatched (401 / INVALID_ADMIN_SECRET).
    Threat ref: T-11-05.

    NOTE: require_admin_auth raises HTTPException directly (it must run
    inside the constant-time compare path). This subclass exists for
    test assertions + future composability."""


class ApiKeyExpiredError(BridgeError):
    """Valid API key passed but expires_at < now() (401 / API_KEY_EXPIRED).
    Threat ref: T-11-04."""


class ApiKeyRevokedError(BridgeError):
    """Valid API key passed but revoked_at IS NOT NULL (401 / API_KEY_REVOKED).
    Threat ref: T-11-04."""


# ----------------------------------------------------------------------------
# Phase 9 Plan 05: unified ErrorResponse handlers (D-17).
# ----------------------------------------------------------------------------


logger = logging.getLogger(__name__)


_HTTP_STATUS_CODE_MAP: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    413: "FILE_TOO_LARGE",
    415: "UNSUPPORTED_FORMAT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


# Ordered map of BridgeError subtype -> (HTTP status, stable code). Order
# matters: :class:`InvalidSmartsError`/:class:`InvalidInchiKeyError`/
# :class:`InvalidSmilesError` (Plan 03) must be tested before
# :class:`ExtractionError` because they are peer classes, not subclasses
# — ``isinstance`` walks in insertion order and the first match wins.
_BRIDGE_ERROR_MAP: list[tuple[type[BridgeError], int, str]] = [
    (FileSizeError, 413, "FILE_TOO_LARGE"),
    (JVMStartupError, 503, "JVM_UNAVAILABLE"),
    (FormatDetectionError, 415, "UNSUPPORTED_FORMAT"),
    (InvalidSmartsError, 422, "INVALID_SMARTS"),
    (InvalidInchiKeyError, 422, "INVALID_INCHI_KEY"),
    (InvalidSmilesError, 422, "INVALID_SMILES"),
    (InvalidQueryError, 422, "INVALID_QUERY"),
    (QueryTooLargeError, 422, "QUERY_TOO_LARGE"),
    (ExtractionError, 422, "EXTRACTION_FAILED"),
    (NullFieldError, 500, "NULL_FIELD"),
    # Phase 11 auth/CSRF/admin subclasses (Plan 11-02).
    (CSRFValidationError, 403, "CSRF_INVALID"),
    (InvalidSessionCodeError, 422, "INVALID_SESSION_CODE"),
    (InvalidAdminSecretError, 401, "INVALID_ADMIN_SECRET"),
    (ApiKeyExpiredError, 401, "API_KEY_EXPIRED"),
    (ApiKeyRevokedError, 401, "API_KEY_REVOKED"),
]


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Map FastAPI :class:`HTTPException` to :class:`ErrorResponse` (D-17).

    Existing routers call ``raise HTTPException(status_code=N, detail='msg')``
    with a plain string. The handler derives ``code`` from the status-code
    lookup table so legacy call sites keep working unchanged while every
    4xx/5xx body converges on ``{detail, code}``.

    Any ``headers`` attached to the raised :class:`HTTPException` are
    propagated onto the response — critical for 401 responses, which
    must carry a ``WWW-Authenticate`` challenge per RFC 6750.
    """
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    code = _HTTP_STATUS_CODE_MAP.get(exc.status_code, "ERROR")
    return JSONResponse(
        status_code=exc.status_code,
        headers=exc.headers,
        content=ErrorResponse(detail=detail, code=code).model_dump(),
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Map Pydantic :class:`RequestValidationError` to a populated 422 body.

    ``fields`` is a map of ``"<dotted.path>"`` → ``[message, ...]``. The
    leading ``body`` segment is stripped (every request body starts with
    it); if only ``body`` was present we fall back to ``"(root)"`` so the
    key is always non-empty.
    """
    fields: dict[str, list[str]] = {}
    for err in exc.errors():
        loc_parts = [str(p) for p in err["loc"] if p != "body"]
        loc = ".".join(loc_parts) if loc_parts else "(root)"
        fields.setdefault(loc, []).append(err["msg"])
    return JSONResponse(
        status_code=422,
        content=ErrorResponse(
            detail="Request validation failed.",
            code="VALIDATION_ERROR",
            fields=fields or None,
        ).model_dump(),
    )


async def bridge_error_handler(request: Request, exc: BridgeError) -> JSONResponse:
    """Map :class:`BridgeError` subtypes to :class:`ErrorResponse` (D-17).

    Replaces the legacy ``{"error": str(exc)}`` shape. Status + stable
    code come from :data:`_BRIDGE_ERROR_MAP` (ordered, first-match wins).
    """
    status, code = 500, "INTERNAL_ERROR"
    for exc_type, mapped_status, mapped_code in _BRIDGE_ERROR_MAP:
        if isinstance(exc, exc_type):
            status, code = mapped_status, mapped_code
            break
    return JSONResponse(
        status_code=status,
        content=ErrorResponse(detail=str(exc), code=code).model_dump(),
    )


async def rate_limit_exceeded_handler(request: Request, exc: Exception) -> JSONResponse:
    """Normalise slowapi's RateLimitExceeded into the unified ErrorResponse.

    slowapi ships its own ``_rate_limit_exceeded_handler`` which returns a
    plain text body — this wrapper replaces it so ``429`` shares the same
    ``{detail, code}`` JSON contract as every other 4xx.

    Retry-After is derived from the tripped ``RateLimitItem.get_expiry()``
    (period in seconds) so clients can back off deterministically. Falling
    back to 60 s keeps the header present even if the limit object doesn't
    expose an expiry.
    """
    # Late import to keep slowapi optional at import time.
    from slowapi.errors import RateLimitExceeded  # noqa: PLC0415

    if not isinstance(exc, RateLimitExceeded):
        # Defensive — registered only for RateLimitExceeded, but fall
        # through to the unhandled handler on shape mismatch.
        return await unhandled_exception_handler(request, exc)

    retry_after_secs: int = 60
    try:
        limit_item = exc.limit.limit  # RequestLimit → RateLimitItem
        if hasattr(limit_item, "get_expiry"):
            retry_after_secs = max(1, int(limit_item.get_expiry()))
    except AttributeError:
        # Shape drift in future slowapi release — keep the 60 s fallback.
        pass

    detail = getattr(exc, "detail", None) or "limit reached"
    return JSONResponse(
        status_code=429,
        headers={"Retry-After": str(retry_after_secs)},
        content=ErrorResponse(
            detail=f"Rate limit exceeded: {detail}",
            code="RATE_LIMITED",
        ).model_dump(),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unexpected errors.

    Logs the full traceback server-side, returns a generic message in the
    response body — no Java class names, no stack frames exposed (D-17,
    §Security Domain, threat T-09-05-01).

    Special case: :class:`asyncio.TimeoutError` (aliased to the built-in
    :class:`TimeoutError` on Python 3.11+) from ``run_in_jvm_thread`` is
    re-mapped to 503 + ``code='JVM_TIMEOUT'`` so the client can retry
    with a narrower query (threat T-09-05-02).
    """
    if isinstance(exc, TimeoutError):
        logger.warning("JVM call timed out on %s: %s", request.url.path, exc)
        return JSONResponse(
            status_code=503,
            content=ErrorResponse(
                detail="Search took too long and was cancelled. Try a narrower query.",
                code="JVM_TIMEOUT",
            ).model_dump(),
        )
    logger.exception("Unhandled exception on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            detail="An unexpected error occurred.",
            code="INTERNAL_ERROR",
        ).model_dump(),
    )
