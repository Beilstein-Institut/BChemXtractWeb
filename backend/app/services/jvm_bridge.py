"""JVM lifecycle management, thread pool, and async bridge for JPype calls.

This module is the foundation of the JPype bridge layer. It handles:

- **JVM startup** via ``initialize_jvm()`` (called once during FastAPI lifespan)
- **Thread pool** for routing blocking JPype calls off the async event loop
- **Thread detach** in finally blocks to prevent JVM resource leaks
- **Async wrapper** ``run_in_jvm_thread()`` for use in async endpoint handlers

All other bridge code (format detection, extraction, DTO conversion) depends
on this module being initialized first.

Key constraints:
    - ``jpype.startJVM()`` can only be called once per process (irreversible).
    - Each thread in the pool must call ``jpype.java.lang.Thread.detach()``
      after completing a Java call to release JVM thread resources.
    - If JVM fails to start, the app exits fatally (D-02).
"""

from __future__ import annotations

import asyncio
import contextlib
import glob
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING, Any, TypeVar

import jpype

from app.errors import JVMStartupError

if TYPE_CHECKING:
    from app.config import Settings

logger = logging.getLogger(__name__)

T = TypeVar("T")

_executor: ThreadPoolExecutor | None = None


def initialize_jvm(settings: Settings) -> None:
    """Start the JVM with the BChemXtract fat JAR on the classpath.

    This function is idempotent: if the JVM is already started, it logs a
    warning and returns without error (singleton guard per D-01).

    After starting the JVM, it creates a bounded ``ThreadPoolExecutor``
    with ``settings.jpype_workers`` threads for routing JPype calls.

    Args:
        settings: Application settings containing ``jar_path``,
            ``jvm_max_heap``, ``jpype_workers``, and ``jvm_opts``.

    Raises:
        JVMStartupError: If no JAR is found or the JVM fails to start.
    """
    global _executor  # noqa: PLW0603

    if jpype.isJVMStarted():
        logger.warning("JVM is already started -- skipping initialization")
        return

    # Locate the BChemXtract fat JAR
    jars = glob.glob(
        f"{settings.jar_path}/bchemxtract-*-jar-with-dependencies.jar"
    )
    if not jars:
        raise JVMStartupError(
            f"No BChemXtract JAR found in {settings.jar_path}",
            detail="Run 'bash scripts/build_jar.sh' to build the JAR",
        )

    # Build JVM arguments
    jvm_args: list[str] = [f"-Xmx{settings.jvm_max_heap}"]
    if settings.jvm_opts:
        jvm_args.extend(settings.jvm_opts.split())

    try:
        jpype.startJVM(
            *jvm_args,
            classpath=[jars[0]],
            convertStrings=True,
        )
    except Exception as exc:
        raise JVMStartupError(
            f"JVM failed to start: {exc}",
            detail=str(exc),
        ) from exc

    logger.info(
        "JVM started successfully (JAR=%s, heap=%s)",
        jars[0],
        settings.jvm_max_heap,
    )

    # Create bounded thread pool for JPype calls (D-04)
    _executor = ThreadPoolExecutor(
        max_workers=settings.jpype_workers,
        thread_name_prefix="jpype-worker",
    )
    logger.info(
        "JPype thread pool created (workers=%d)",
        settings.jpype_workers,
    )


def shutdown_pool() -> None:
    """Shut down the JPype thread pool gracefully.

    Waits for in-flight tasks to complete. Does not cancel queued futures.
    JVM shutdown is intentionally skipped -- it is effectively irreversible
    and not needed for clean process exit.
    """
    global _executor  # noqa: PLW0603
    if _executor is not None:
        logger.info("Shutting down JPype thread pool")
        _executor.shutdown(wait=True, cancel_futures=False)
        _executor = None


def get_executor() -> ThreadPoolExecutor:
    """Return the JPype thread pool executor.

    Returns:
        The active ThreadPoolExecutor for JPype calls.

    Raises:
        RuntimeError: If the pool has not been initialized (JVM not started).
    """
    if _executor is None:
        msg = "JPype thread pool is not initialized -- was initialize_jvm() called?"
        raise RuntimeError(msg)
    return _executor


async def run_in_jvm_thread(
    fn: Any,
    *args: Any,
    timeout: float = 30.0,
    **kwargs: Any,
) -> Any:
    """Execute a blocking JPype call in the thread pool with timeout.

    Wraps ``fn(*args, **kwargs)`` in a pool thread that detaches from the
    JVM in a ``finally`` block (preventing resource leaks per D-04). The
    call is guarded by ``asyncio.wait_for`` with the given timeout (D-05).

    Args:
        fn: The blocking callable to execute (typically a JPype Java call).
        *args: Positional arguments passed to ``fn``.
        timeout: Maximum seconds to wait before raising TimeoutError.
            Defaults to 30.0 seconds.
        **kwargs: Keyword arguments passed to ``fn``.

    Returns:
        The return value of ``fn(*args, **kwargs)``.

    Raises:
        TimeoutError: If the call exceeds the timeout (maps to 503).
        RuntimeError: If the thread pool is not initialized.
    """
    loop = asyncio.get_running_loop()

    def _wrapped() -> Any:
        try:
            return fn(*args, **kwargs)
        finally:
            # Thread may not be attached if fn() raised before any
            # Java call -- safe to suppress.
            with contextlib.suppress(Exception):
                jpype.java.lang.Thread.detach()

    try:
        return await asyncio.wait_for(
            loop.run_in_executor(get_executor(), _wrapped),
            timeout=timeout,
        )
    except TimeoutError:
        logger.warning(
            "JPype call timed out after %.1fs: %s",
            timeout,
            fn.__name__ if hasattr(fn, "__name__") else str(fn),
        )
        raise
