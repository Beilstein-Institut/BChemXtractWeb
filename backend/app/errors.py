"""Exception hierarchy for the JPype bridge layer.

All bridge-layer errors inherit from BridgeError, which provides a
consistent interface (message + optional detail) and maps to HTTP
status codes via the FastAPI exception handler at the bottom of this
module.

Exception tree:
    BridgeError
    +-- FileSizeError         (413 Request Entity Too Large)
    +-- JVMStartupError      (503 Service Unavailable)
    +-- FormatDetectionError  (415 Unsupported Media Type)
    +-- ExtractionError       (422 Unprocessable Entity)
    +-- NullFieldError        (500 Internal Server Error)
"""

from fastapi import Request
from fastapi.responses import JSONResponse


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
# Phase 9: Search-domain BridgeError subclasses (422 / stable codes wired
# in Plan 05's unified exception handler). Raising them in Plan 03 currently
# hits the generic 500 path below; callers of POST /api/search should assume
# Plan 05 will ship before search goes to production. Pydantic 422 validation
# still fires end-to-end for malformed request bodies.
# ----------------------------------------------------------------------------


class InvalidSmartsError(BridgeError):
    """User-supplied SMARTS pattern is malformed (422 / INVALID_SMARTS)."""


class InvalidInchiKeyError(BridgeError):
    """User-supplied InChI key doesn't match the 14-10-1 shape (422 / INVALID_INCHI_KEY)."""


class InvalidSmilesError(BridgeError):
    """User-supplied SMILES can't be parsed by CDK (422 / INVALID_SMILES)."""


async def bridge_error_handler(request: Request, exc: BridgeError) -> JSONResponse:
    """Map BridgeError subtypes to HTTP status codes.

    Per D-07: API responses get clean, user-facing messages.
    No Java class names or stack frames are exposed.

    Args:
        request: The incoming FastAPI request.
        exc: The BridgeError (or subtype) that was raised.

    Returns:
        JSONResponse with the appropriate HTTP status code.
    """
    status_map: list[tuple[type, int]] = [
        (FileSizeError, 413),
        (JVMStartupError, 503),
        (FormatDetectionError, 415),
        (ExtractionError, 422),
        (NullFieldError, 500),
    ]
    status = 500
    for exc_type, code in status_map:
        if isinstance(exc, exc_type):
            status = code
            break
    return JSONResponse(
        status_code=status,
        content={"error": str(exc)},
    )
