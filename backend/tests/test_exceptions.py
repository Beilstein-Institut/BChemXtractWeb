"""Tests for exception translation and HTTP mapping (JPYP-04).

Verifies that BridgeError subtypes map to correct HTTP status codes
and that no Java stack traces or class names leak into responses.
"""

import json
from unittest.mock import MagicMock

from app.errors import (
    BridgeError,
    ExtractionError,
    FormatDetectionError,
    JVMStartupError,
    NullFieldError,
    bridge_error_handler,
)
from app.main import app


async def test_format_detection_error_returns_415() -> None:
    """FormatDetectionError maps to HTTP 415 Unsupported Media Type."""
    request = MagicMock()
    exc = FormatDetectionError("Unrecognized file format")
    response = await bridge_error_handler(request, exc)
    assert response.status_code == 415
    assert b"Unrecognized file format" in response.body
    # No Java class names in response
    assert b"org.beilstein" not in response.body
    assert b"java." not in response.body


async def test_extraction_error_returns_422() -> None:
    """ExtractionError maps to HTTP 422 Unprocessable Entity."""
    request = MagicMock()
    exc = ExtractionError("Failed to extract substances")
    response = await bridge_error_handler(request, exc)
    assert response.status_code == 422
    assert b"Failed to extract" in response.body


async def test_jvm_startup_error_returns_503() -> None:
    """JVMStartupError maps to HTTP 503 Service Unavailable."""
    request = MagicMock()
    exc = JVMStartupError("JVM failed to start")
    response = await bridge_error_handler(request, exc)
    assert response.status_code == 503


async def test_null_field_error_returns_500() -> None:
    """NullFieldError maps to HTTP 500 Internal Server Error."""
    request = MagicMock()
    exc = NullFieldError("Unexpected null in required field")
    response = await bridge_error_handler(request, exc)
    assert response.status_code == 500


async def test_base_bridge_error_returns_500() -> None:
    """Unknown BridgeError subtype defaults to HTTP 500."""
    request = MagicMock()
    exc = BridgeError("Unknown bridge error")
    response = await bridge_error_handler(request, exc)
    assert response.status_code == 500


async def test_error_response_is_json() -> None:
    """All error responses are JSON with an 'error' key."""
    request = MagicMock()
    exc = FormatDetectionError("Bad format")
    response = await bridge_error_handler(request, exc)
    body = json.loads(response.body)
    assert "error" in body
    assert body["error"] == "Bad format"


async def test_error_response_no_java_stack_trace() -> None:
    """Error responses never contain Java stack trace patterns."""
    request = MagicMock()
    # Simulate an error that might have Java details in the message
    exc = ExtractionError("Failed to extract substances from file")
    response = await bridge_error_handler(request, exc)
    body_str = response.body.decode()
    # These patterns indicate Java stack trace leakage
    assert "at java.base/" not in body_str
    assert "at org.beilstein" not in body_str
    assert "Exception in thread" not in body_str
    assert ".java:" not in body_str


async def test_exception_handler_registered_on_app() -> None:
    """BridgeError handler is registered on the FastAPI app."""
    # FastAPI stores exception handlers in app.exception_handlers
    assert BridgeError in app.exception_handlers
