"""Tests for JVM lifecycle, thread pool, and exception translation.

Covers requirements:
    JPYP-01: JVM singleton initialization via FastAPI lifespan
    JPYP-02: Bounded ThreadPoolExecutor with thread detach
    JPYP-04: Domain exception hierarchy and HTTP status mapping
"""

from concurrent.futures import ThreadPoolExecutor
from unittest.mock import AsyncMock, patch

import jpype
import pytest
from httpx import AsyncClient

from app.errors import (
    BridgeError,
    ExtractionError,
    FormatDetectionError,
    JVMStartupError,
    NullFieldError,
    bridge_error_handler,
)
from app.services.jvm_bridge import get_executor, initialize_jvm, run_in_jvm_thread

# ---------------------------------------------------------------------------
# JPYP-04: Exception hierarchy (pure-Python, no JVM needed)
# ---------------------------------------------------------------------------


class TestBridgeErrorHierarchy:
    """Verify the BridgeError exception hierarchy and HTTP status mapping."""

    def test_bridge_error_hierarchy(self) -> None:
        """All exception subtypes should be instances of BridgeError."""
        subtypes = (
            JVMStartupError,
            FormatDetectionError,
            ExtractionError,
            NullFieldError,
        )
        for cls in subtypes:
            err = cls("test")
            assert isinstance(err, BridgeError)
            assert isinstance(err, Exception)

    def test_bridge_error_message_and_detail(self) -> None:
        """BridgeError should carry both message and optional detail."""
        err = BridgeError("bad thing", detail="extra context")
        assert str(err) == "bad thing"
        assert err.detail == "extra context"

    def test_bridge_error_detail_defaults_none(self) -> None:
        """BridgeError detail should default to None when not provided."""
        err = BridgeError("oops")
        assert err.detail is None

    async def test_bridge_error_handler_returns_correct_status(self) -> None:
        """bridge_error_handler should map each subtype to the correct HTTP code."""
        expected = {
            JVMStartupError: 503,
            FormatDetectionError: 415,
            ExtractionError: 422,
            NullFieldError: 500,
        }
        mock_request = AsyncMock()
        for cls, status in expected.items():
            exc = cls("test error")
            response = await bridge_error_handler(mock_request, exc)
            assert response.status_code == status, f"{cls.__name__} -> {status}"

    async def test_bridge_error_handler_returns_clean_json(self) -> None:
        """Error response should contain only a clean message, no Java details."""
        mock_request = AsyncMock()
        exc = ExtractionError("Extraction failed for uploaded file")
        response = await bridge_error_handler(mock_request, exc)
        import json

        body = json.loads(response.body)
        assert body == {"error": "Extraction failed for uploaded file"}
        # No Java class names or stack traces in the response
        assert "java" not in response.body.decode().lower()


# ---------------------------------------------------------------------------
# JPYP-01: JVM singleton (requires lifespan via started_app fixture)
# ---------------------------------------------------------------------------


class TestJvmLifecycle:
    """Verify JVM starts once during lifespan and remains available."""

    async def test_jvm_is_started_after_lifespan(self, started_app) -> None:
        """After lifespan startup, jpype.isJVMStarted() should be True."""
        assert jpype.isJVMStarted() is True

    async def test_jvm_singleton_guard(self, started_app) -> None:
        """Calling initialize_jvm a second time should log a warning, not error."""
        from app.config import settings

        # Should not raise -- just logs a warning and returns
        initialize_jvm(settings)
        assert jpype.isJVMStarted() is True


# ---------------------------------------------------------------------------
# JPYP-02: Thread pool and run_in_jvm_thread (requires lifespan)
# ---------------------------------------------------------------------------


class TestThreadPool:
    """Verify the bounded thread pool and async bridge wrapper."""

    async def test_executor_is_available(self, started_app) -> None:
        """get_executor() should return a ThreadPoolExecutor after lifespan."""
        executor = get_executor()
        assert isinstance(executor, ThreadPoolExecutor)

    async def test_run_in_jvm_thread_executes_callable(self, started_app) -> None:
        """A simple function should run via run_in_jvm_thread and return its value."""
        result = await run_in_jvm_thread(lambda: 42)
        assert result == 42

    async def test_run_in_jvm_thread_passes_args(self, started_app) -> None:
        """run_in_jvm_thread should forward positional and keyword args."""

        def add(a: int, b: int) -> int:
            return a + b

        result = await run_in_jvm_thread(add, 3, b=7)
        assert result == 10

    async def test_run_in_jvm_thread_timeout(self) -> None:
        """run_in_jvm_thread should raise TimeoutError when the call exceeds timeout."""
        import time

        def slow_fn() -> str:
            time.sleep(5)
            return "done"

        tiny_pool = ThreadPoolExecutor(max_workers=1)
        with (
            patch("app.services.jvm_bridge._executor", tiny_pool),
            pytest.raises(TimeoutError),
        ):
            await run_in_jvm_thread(slow_fn, timeout=0.1)
        tiny_pool.shutdown(wait=False, cancel_futures=True)

    async def test_run_in_jvm_thread_detaches_thread(self, started_app) -> None:
        """After execution, the wrapper should detach thread from JVM.

        We verify this indirectly by patching the jpype module-level reference
        in jvm_bridge (since Java static methods can't be patched via mock).
        We replace the entire jpype reference in the module namespace with a
        wrapper that tracks the detach call.
        """
        import app.services.jvm_bridge as bridge_mod

        detach_called = False
        original_jpype = bridge_mod.jpype

        class _JpypeProxy:
            """Proxy that delegates to real jpype but tracks detach calls."""

            def __getattr__(self, name: str):
                return getattr(original_jpype, name)

            @property
            def java(self):
                class _JavaProxy:
                    @property
                    def lang(self):
                        class _LangProxy:
                            class Thread:
                                @staticmethod
                                def detach():
                                    nonlocal detach_called
                                    detach_called = True
                                    return original_jpype.java.lang.Thread.detach()
                        return _LangProxy()
                return _JavaProxy()

        bridge_mod.jpype = _JpypeProxy()
        try:
            await run_in_jvm_thread(lambda: "test")
        finally:
            bridge_mod.jpype = original_jpype

        assert detach_called, "Thread.detach() should have been called in finally block"


# ---------------------------------------------------------------------------
# Integration: health endpoint with JVM running
# ---------------------------------------------------------------------------


class TestHealthWithJvm:
    """Verify existing health endpoint works with JVM-aware client."""

    async def test_health_returns_ok_with_jvm(self, client: AsyncClient) -> None:
        """GET /api/health should return 200 with status ok when JVM is running."""
        response = await client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
