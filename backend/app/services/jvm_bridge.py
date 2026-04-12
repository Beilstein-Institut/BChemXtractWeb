"""JVM lifecycle management and thread pool for JPype bridge.

Manages the singleton JVM process, bounded thread pool for concurrent
JPype calls, and async wrapper for running blocking Java operations.
"""

import asyncio
import glob
import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import suppress

import jpype

from app.config import Settings
from app.errors import JVMStartupError

logger = logging.getLogger(__name__)

_executor: ThreadPoolExecutor | None = None


def initialize_jvm(settings: Settings) -> None:
    """Start the JVM with BChemXtract JAR on the classpath.

    Guards against double-start (JVM is process-global and irreversible).
    Creates a bounded ThreadPoolExecutor for concurrent JPype calls.

    Args:
        settings: Application settings with JVM configuration.

    Raises:
        JVMStartupError: If JAR not found or JVM fails to start.
    """
    global _executor  # noqa: PLW0603

    if jpype.isJVMStarted():
        logger.warning("JVM already started, skipping initialization")
        return

    jars = glob.glob(
        f"{settings.jar_path}/bchemxtract-*-jar-with-dependencies.jar"
    )
    if not jars:
        raise JVMStartupError(
            f"No BChemXtract JAR found in {settings.jar_path}/"
        )

    jvm_args = [f"-Xmx{settings.jvm_max_heap}"]
    if settings.jvm_opts:
        jvm_args.extend(settings.jvm_opts.split())

    try:
        jpype.startJVM(
            *jvm_args,
            classpath=[jars[0]],
            convertStrings=True,
        )
    except Exception as exc:
        raise JVMStartupError(f"Failed to start JVM: {exc}") from exc

    logger.info(
        "JVM started: version=%s, jar=%s",
        jpype.getJVMVersion(),
        jars[0],
    )

    _executor = ThreadPoolExecutor(
        max_workers=settings.jpype_workers,
        thread_name_prefix="jpype-worker",
    )


def shutdown_pool() -> None:
    """Shut down the thread pool gracefully.

    JVM shutdown is intentionally skipped -- it is irreversible.
    """
    global _executor  # noqa: PLW0603
    if _executor is not None:
        _executor.shutdown(wait=True, cancel_futures=False)
        _executor = None


def get_executor() -> ThreadPoolExecutor:
    """Return the active ThreadPoolExecutor.

    Returns:
        The JPype worker thread pool.

    Raises:
        RuntimeError: If the thread pool has not been initialized.
    """
    if _executor is None:
        msg = "Thread pool not initialized. Was initialize_jvm() called?"
        raise RuntimeError(msg)
    return _executor


async def run_in_jvm_thread(
    fn: object,
    *args: object,
    timeout: float = 30.0,
    **kwargs: object,
) -> object:
    """Execute a blocking function in the JPype thread pool.

    Wraps the function call with thread detach in a finally block
    to prevent JVM thread leaks.

    Args:
        fn: Callable to execute in the thread pool.
        *args: Positional arguments for fn.
        timeout: Maximum seconds to wait. Defaults to 30.0.
        **kwargs: Keyword arguments for fn.

    Returns:
        The return value of fn(*args, **kwargs).

    Raises:
        TimeoutError: If execution exceeds the timeout.
        RuntimeError: If thread pool is not initialized.
    """
    loop = asyncio.get_running_loop()

    def _wrapped() -> object:
        try:
            return fn(*args, **kwargs)
        finally:
            with suppress(Exception):
                jpype.java.lang.Thread.detach()

    try:
        return await asyncio.wait_for(
            loop.run_in_executor(get_executor(), _wrapped),
            timeout=timeout,
        )
    except TimeoutError:
        logger.warning("JVM thread call timed out after %.1fs", timeout)
        raise
