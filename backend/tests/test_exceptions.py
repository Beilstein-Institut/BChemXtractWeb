"""Tests for exception translation and HTTP mapping (JPYP-04 + D-17).

Verifies that BridgeError subtypes map to correct HTTP status codes and
stable error codes, and that no Java stack traces or class names leak
into responses.

Plan 09-05 (D-17) rewrote bridge_error_handler to emit the unified
ErrorResponse shape (``{detail, code, fields?}``). The legacy
``{"error": ...}`` body is gone — these tests assert the new shape.
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
    """FormatDetectionError maps to HTTP 415 + code=UNSUPPORTED_FORMAT."""
    request = MagicMock()
    exc = FormatDetectionError("Unrecognized file format")
    response = await bridge_error_handler(request, exc)
    assert response.status_code == 415
    body = json.loads(response.body)
    assert body["detail"] == "Unrecognized file format"
    assert body["code"] == "UNSUPPORTED_FORMAT"
    # No Java class names in response
    assert b"org.beilstein" not in response.body
    assert b"java." not in response.body


async def test_extraction_error_returns_422() -> None:
    """ExtractionError maps to HTTP 422 + code=EXTRACTION_FAILED."""
    request = MagicMock()
    exc = ExtractionError("Failed to extract substances")
    response = await bridge_error_handler(request, exc)
    assert response.status_code == 422
    body = json.loads(response.body)
    assert body["detail"] == "Failed to extract substances"
    assert body["code"] == "EXTRACTION_FAILED"


async def test_jvm_startup_error_returns_503() -> None:
    """JVMStartupError maps to HTTP 503 + code=JVM_UNAVAILABLE."""
    request = MagicMock()
    exc = JVMStartupError("JVM failed to start")
    response = await bridge_error_handler(request, exc)
    assert response.status_code == 503
    body = json.loads(response.body)
    assert body["code"] == "JVM_UNAVAILABLE"


async def test_null_field_error_returns_500() -> None:
    """NullFieldError maps to HTTP 500 + code=NULL_FIELD."""
    request = MagicMock()
    exc = NullFieldError("Unexpected null in required field")
    response = await bridge_error_handler(request, exc)
    assert response.status_code == 500
    body = json.loads(response.body)
    assert body["code"] == "NULL_FIELD"


async def test_base_bridge_error_returns_500() -> None:
    """Unknown BridgeError subtype defaults to HTTP 500 + code=INTERNAL_ERROR."""
    request = MagicMock()
    exc = BridgeError("Unknown bridge error")
    response = await bridge_error_handler(request, exc)
    assert response.status_code == 500
    body = json.loads(response.body)
    assert body["code"] == "INTERNAL_ERROR"


async def test_error_response_is_json() -> None:
    """All error responses are JSON with unified {detail, code} shape (D-17)."""
    request = MagicMock()
    exc = FormatDetectionError("Bad format")
    response = await bridge_error_handler(request, exc)
    body = json.loads(response.body)
    assert "detail" in body
    assert body["detail"] == "Bad format"
    assert "code" in body
    assert body["code"] == "UNSUPPORTED_FORMAT"
    # Legacy shape removed
    assert "error" not in body


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
