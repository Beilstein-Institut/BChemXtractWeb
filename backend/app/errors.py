"""Exception hierarchy for the JPype bridge layer.

All bridge-layer errors inherit from BridgeError, which provides a
consistent interface (message + optional detail) and maps to HTTP
status codes via the FastAPI exception handler at the bottom of this
module.

Exception tree:
    BridgeError
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
    status_map: dict[type, int] = {
        JVMStartupError: 503,
        FormatDetectionError: 415,
        ExtractionError: 422,
        NullFieldError: 500,
    }
    status = status_map.get(type(exc), 500)
    return JSONResponse(
        status_code=status,
        content={"error": str(exc)},
    )
