"""Exception hierarchy for JPype bridge layer errors.

Maps Java bridge failures to typed Python exceptions with HTTP status codes.
Exception handler ensures Java stack traces never leak into API responses (D-07).
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
    """Map BridgeError subtypes to HTTP status codes (per D-07).

    Args:
        request: The incoming HTTP request.
        exc: The BridgeError exception instance.

    Returns:
        JSONResponse with appropriate HTTP status code and error message.
    """
    status_map = {
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
