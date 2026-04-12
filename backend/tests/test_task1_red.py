"""RED phase tests for Task 1: exception hierarchy, JVM settings, jvm_bridge service."""

import pytest


class TestExceptionHierarchy:
    """Tests for the BridgeError exception hierarchy."""

    def test_bridge_error_is_exception_subclass(self) -> None:
        """BridgeError should be a subclass of Exception."""
        from app.errors import BridgeError

        assert issubclass(BridgeError, Exception)

    def test_bridge_error_has_message_and_detail(self) -> None:
        """BridgeError should accept message and detail attributes."""
        from app.errors import BridgeError

        err = BridgeError("test message", detail="extra info")
        assert str(err) == "test message"
        assert err.detail == "extra info"

    def test_bridge_error_detail_defaults_to_none(self) -> None:
        """BridgeError detail should default to None."""
        from app.errors import BridgeError

        err = BridgeError("test message")
        assert err.detail is None

    def test_jvm_startup_error_is_bridge_error(self) -> None:
        """JVMStartupError should be a subclass of BridgeError."""
        from app.errors import BridgeError, JVMStartupError

        assert issubclass(JVMStartupError, BridgeError)
        err = JVMStartupError("jvm failed")
        assert isinstance(err, BridgeError)

    def test_format_detection_error_is_bridge_error(self) -> None:
        """FormatDetectionError should be a subclass of BridgeError."""
        from app.errors import BridgeError, FormatDetectionError

        assert issubclass(FormatDetectionError, BridgeError)

    def test_extraction_error_is_bridge_error(self) -> None:
        """ExtractionError should be a subclass of BridgeError."""
        from app.errors import BridgeError, ExtractionError

        assert issubclass(ExtractionError, BridgeError)

    def test_null_field_error_is_bridge_error(self) -> None:
        """NullFieldError should be a subclass of BridgeError."""
        from app.errors import BridgeError, NullFieldError

        assert issubclass(NullFieldError, BridgeError)


class TestSettings:
    """Tests for JVM-related settings in config."""

    def test_settings_has_jvm_max_heap(self) -> None:
        """Settings should have jvm_max_heap field with default '512m'."""
        from app.config import settings

        assert settings.jvm_max_heap == "512m"

    def test_settings_has_jpype_workers(self) -> None:
        """Settings should have jpype_workers field with default 4."""
        from app.config import settings

        assert settings.jpype_workers == 4

    def test_settings_has_jvm_opts(self) -> None:
        """Settings should have jvm_opts field with default None."""
        from app.config import settings

        assert settings.jvm_opts is None


class TestJvmBridge:
    """Tests for the jvm_bridge service module."""

    def test_initialize_jvm_raises_on_missing_jar(self) -> None:
        """initialize_jvm should raise JVMStartupError when JAR not found."""
        from unittest.mock import patch

        from app.config import Settings
        from app.errors import JVMStartupError
        from app.services.jvm_bridge import initialize_jvm

        mock_settings = Settings(jar_path="/nonexistent/path")

        with patch("app.services.jvm_bridge.jpype") as mock_jpype:
            mock_jpype.isJVMStarted.return_value = False
            with pytest.raises(JVMStartupError, match="No BChemXtract JAR found"):
                initialize_jvm(mock_settings)

    async def test_run_in_jvm_thread_timeout(self) -> None:
        """run_in_jvm_thread should raise TimeoutError on pool exhaustion."""
        import asyncio
        from concurrent.futures import ThreadPoolExecutor
        from unittest.mock import patch

        from app.services.jvm_bridge import run_in_jvm_thread

        def slow_fn() -> str:
            import time

            time.sleep(5)
            return "done"

        # Patch the executor with a tiny pool and use a very short timeout
        tiny_pool = ThreadPoolExecutor(max_workers=1)
        with patch("app.services.jvm_bridge._executor", tiny_pool):
            with pytest.raises(asyncio.TimeoutError):
                await run_in_jvm_thread(slow_fn, timeout=0.1)
        tiny_pool.shutdown(wait=False, cancel_futures=True)
