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
    +-- FileSizeError         (413 FILE_TOO_LARGE)
    +-- JVMStartupError       (503 JVM_UNAVAILABLE)
    +-- FormatDetectionError  (415 UNSUPPORTED_FORMAT)
    +-- ExtractionError       (422 EXTRACTION_FAILED)
    +-- NullFieldError        (500 NULL_FIELD)
    +-- InvalidSmartsError    (422 INVALID_SMARTS)
    +-- InvalidInchiKeyError  (422 INVALID_INCHI_KEY)
    +-- InvalidSmilesError    (422 INVALID_SMILES)
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
    """User-supplied InChI key doesn't match the 14-10-1 shape (422 / INVALID_INCHI_KEY)."""


class InvalidSmilesError(BridgeError):
    """User-supplied SMILES can't be parsed by CDK (422 / INVALID_SMILES)."""


# ----------------------------------------------------------------------------
# Phase 9 Plan 05: unified ErrorResponse handlers (D-17).
# ----------------------------------------------------------------------------


logger = logging.getLogger(__name__)


_HTTP_STATUS_CODE_MAP: dict[int, str] = {
    400: "BAD_REQUEST",
    404: "NOT_FOUND",
    413: "FILE_TOO_LARGE",
    415: "UNSUPPORTED_FORMAT",
    422: "VALIDATION_ERROR",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


async def http_exception_handler(
    request: Request, exc: HTTPException
) -> JSONResponse:
    """Map FastAPI :class:`HTTPException` to :class:`ErrorResponse` (D-17).

    Existing routers call ``raise HTTPException(status_code=N, detail='msg')``
    with a plain string. The handler derives ``code`` from the status-code
    lookup table so legacy call sites keep working unchanged while every
    4xx/5xx body converges on ``{detail, code}``.
    """
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    code = _HTTP_STATUS_CODE_MAP.get(exc.status_code, "ERROR")
    return JSONResponse(
        status_code=exc.status_code,
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


async def bridge_error_handler(
    request: Request, exc: BridgeError
) -> JSONResponse:
    """Map :class:`BridgeError` subtypes to :class:`ErrorResponse` (D-17).

    Replaces the legacy ``{"error": str(exc)}`` shape. Status + stable
    code come from the ordered ``status_and_code`` tuple list.

    Ordering matters: :class:`InvalidSmartsError` / :class:`InvalidInchiKeyError`
    / :class:`InvalidSmilesError` (Plan 03) appear before :class:`ExtractionError`
    because they are not subclasses of each other — :func:`isinstance` walks
    the tuple in order and the first match wins.
    """
    status_and_code: list[tuple[type, int, str]] = [
        (FileSizeError, 413, "FILE_TOO_LARGE"),
        (JVMStartupError, 503, "JVM_UNAVAILABLE"),
        (FormatDetectionError, 415, "UNSUPPORTED_FORMAT"),
        (InvalidSmartsError, 422, "INVALID_SMARTS"),
        (InvalidInchiKeyError, 422, "INVALID_INCHI_KEY"),
        (InvalidSmilesError, 422, "INVALID_SMILES"),
        (ExtractionError, 422, "EXTRACTION_FAILED"),
        (NullFieldError, 500, "NULL_FIELD"),
    ]
    status, code = 500, "INTERNAL_ERROR"
    for exc_type, st, co in status_and_code:
        if isinstance(exc, exc_type):
            status, code = st, co
            break
    return JSONResponse(
        status_code=status,
        content=ErrorResponse(detail=str(exc), code=code).model_dump(),
    )


async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
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
    logger.exception(
        "Unhandled exception on %s: %s", request.url.path, exc
    )
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            detail="An unexpected error occurred.",
            code="INTERNAL_ERROR",
        ).model_dump(),
    )
