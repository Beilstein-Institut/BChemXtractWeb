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
    - If JVM fails to start, the app exits fatally.
"""

from __future__ import annotations

import asyncio
import contextlib
import glob
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING, Any, TypeVar

import jpype

from app.errors import JVMStartupError

if TYPE_CHECKING:
    from app.config import Settings

logger = logging.getLogger(__name__)

T = TypeVar("T")

_executor: ThreadPoolExecutor | None = None
_pool_size: int = 0

# Cap on concurrent in-flight JVM daemon subtasks, INCLUDING ones abandoned
# after a timeout that are still draining a native call. JPype cannot interrupt
# a native call, so a flood of pathological inputs would otherwise spawn
# unbounded daemons (each holding a JVM thread + native memory) and exhaust the
# process. Once the slots are full, new JVM work is refused (-> 503) instead of
# growing without bound. Generous vs the small worker pool so normal concurrent
# work never trips it. See :func:`_run_jvm_subtask`.
_MAX_INFLIGHT_JVM_SUBTASKS = 16
_jvm_subtask_slots = threading.BoundedSemaphore(_MAX_INFLIGHT_JVM_SUBTASKS)

# Extra outer-timeout headroom for run_in_jvm_thread_abandonable: the inner
# daemon's own TimeoutError (which frees the worker) must surface before the
# outer run_in_jvm_thread guard fires.
_ABANDON_OUTER_BUFFER = 5.0


def initialize_jvm(settings: Settings) -> None:
    """Start the JVM with the BChemXtract fat JAR on the classpath.

    This function is idempotent: if the JVM is already started, it logs a
    warning and returns without error (singleton guard).

    After starting the JVM, it creates a bounded ``ThreadPoolExecutor``
    with ``settings.jpype_workers`` threads for routing JPype calls.

    Args:
        settings: Application settings containing ``jar_path``,
            ``jvm_max_heap``, ``jpype_workers``, and ``jvm_opts``.

    Raises:
        JVMStartupError: If no JAR is found or the JVM fails to start.
    """
    global _executor, _pool_size  # noqa: PLW0603

    if jpype.isJVMStarted():
        logger.warning("JVM is already started -- skipping initialization")
        return

    # Locate the BChemXtract fat JAR plus the first-party cdx-render jar.
    jars = glob.glob(f"{settings.jar_path}/bchemxtract-*-jar-with-dependencies.jar")
    if not jars:
        raise JVMStartupError(
            f"No BChemXtract JAR found in {settings.jar_path}",
            detail="Run 'bash scripts/build_jar.sh' to build the JAR",
        )
    # cdx-render is optional at import time but required for the render endpoint.
    render_jars = glob.glob(f"{settings.jar_path}/cdx-render-*.jar")
    classpath = [jars[0], *render_jars]

    # Build JVM arguments
    jvm_args: list[str] = [
        f"-Xmx{settings.jvm_max_heap}",
        # Required for CDK SVG rendering in headless environments
        "-Djava.awt.headless=true",
    ]
    if settings.jvm_opts:
        jvm_args.extend(settings.jvm_opts.split())

    try:
        jpype.startJVM(
            *jvm_args,
            classpath=classpath,
            convertStrings=True,
        )
    except Exception as exc:
        raise JVMStartupError(
            f"JVM failed to start: {exc}",
            detail=str(exc),
        ) from exc

    logger.info(
        "JVM started successfully (classpath=%s, heap=%s)",
        classpath,
        settings.jvm_max_heap,
    )

    # Create bounded thread pool for JPype calls
    _pool_size = settings.jpype_workers
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


def get_pool_stats() -> dict[str, int]:
    """Return thread pool statistics using public interfaces where possible.

    The ``workers`` count is tracked at creation time to avoid accessing the
    private ``_max_workers`` attribute. The ``active`` count uses the private
    ``_threads`` attribute with a ``hasattr`` guard since there is no public
    stdlib API for this -- if the attribute is removed in a future Python
    version the value falls back to 0.

    Returns:
        Dict with ``workers`` (configured max) and ``active`` (live threads).
    """
    if _executor is None:
        return {"workers": 0, "active": 0}
    active = 0
    if hasattr(_executor, "_threads"):
        active = len([t for t in _executor._threads if t.is_alive()])
    return {"workers": _pool_size, "active": active}


async def run_in_jvm_thread(
    fn: Any,
    *args: Any,
    timeout: float = 30.0,
    **kwargs: Any,
) -> Any:
    """Execute a blocking JPype call in the thread pool with timeout.

    Wraps ``fn(*args, **kwargs)`` in a pool thread that detaches from the
    JVM in a ``finally`` block (preventing resource leaks). The call is
    guarded by ``asyncio.wait_for`` with the given timeout.

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
            "JPype call timed out after %.1fs: %s. "
            "NOTE: The underlying thread continues running and occupies "
            "a pool slot until the Java call completes.",
            timeout,
            fn.__name__ if hasattr(fn, "__name__") else str(fn),
        )
        raise


def _run_jvm_subtask(fn: Any, timeout: float, label: str) -> Any:
    """Run a JVM-bound callable on a daemon thread with a hard timeout.

    Returns ``fn()``'s value, or raises :class:`TimeoutError` if it does not
    finish within ``timeout`` seconds. Any other exception from ``fn`` is
    re-raised on the caller's thread.

    On timeout the daemon thread is abandoned: it keeps a JVM thread until the
    native call returns (or the process exits), but the *calling* JPype pool
    worker is freed immediately. Without this, a CDK call that hangs on a
    crafted/pathological graph (SMILES generation, depiction, or substructure
    matching on a huge symmetric molecule) would pin a pool worker for the full
    outer timeout and never release it, so a few crafted requests could exhaust
    the fixed JPype pool and stall the whole API (CWE-400). A daemon thread (not
    a ThreadPoolExecutor) is used so an abandoned hung call never blocks
    interpreter shutdown.

    The daemon thread is attached to the JVM (as a JVM *daemon* thread, so an
    abandoned-on-timeout thread never wedges JVM shutdown) before ``fn`` runs
    and detached after, so ``fn`` is just its real CDK work -- no attach/detach
    boilerplate. (Attach is skipped when the JVM isn't started, e.g. pure-Python
    unit tests.)

    Raises :class:`TimeoutError` (-> 503) immediately when too many JVM
    subtasks are already in flight (:data:`_MAX_INFLIGHT_JVM_SUBTASKS`),
    bounding daemon/native-memory growth under a flood of pathological inputs.
    """
    # The permit is held until the daemon TRULY finishes (released in the
    # runner's finally), so an abandoned-but-still-draining call keeps occupying
    # a slot -- that is what bounds accumulation. Non-blocking: a full pool means
    # the server is overloaded, so fail fast rather than queue.
    if not _jvm_subtask_slots.acquire(blocking=False):
        raise TimeoutError(f"JVM is busy ({label}); too many concurrent operations")

    box: dict[str, object] = {}
    done = threading.Event()

    def _runner() -> None:
        try:
            # Attach as a JVM *daemon* thread. This thread is abandoned on
            # timeout (it keeps running until its native call returns), so a
            # non-daemon attachment (jpype.attachThreadToJVM) would make the
            # JVM's DestroyJavaVM block on -- and crash over -- the still-running
            # abandoned thread at interpreter shutdown (SIGSEGV). Daemon threads
            # are reaped cleanly by the JVM at shutdown. Guard the whole block on
            # isJVMStarted() -- touching ``jpype.java.lang`` without a JVM raises,
            # so pure-Python unit tests (no JVM) skip attach entirely.
            if jpype.isJVMStarted():
                jvm_thread = jpype.java.lang.Thread
                if not jvm_thread.isAttached():
                    jvm_thread.attachAsDaemon()
            box["value"] = fn()
        except BaseException as exc:  # noqa: BLE001 -- re-raised on caller thread
            box["error"] = exc
        finally:
            if jpype.isJVMStarted():
                with contextlib.suppress(Exception):
                    jpype.java.lang.Thread.detach()
            done.set()
            _jvm_subtask_slots.release()

    try:
        threading.Thread(target=_runner, name=label, daemon=True).start()
    except BaseException:
        # start() failed after we took the permit and before _runner (which owns
        # the release) could run -- release here so the slot isn't leaked.
        _jvm_subtask_slots.release()
        raise
    if not done.wait(timeout):
        raise TimeoutError(f"{label} exceeded {timeout:.0f}s")
    if "error" in box:
        raise box["error"]  # type: ignore[misc]
    return box.get("value")


async def run_in_jvm_thread_abandonable(
    fn: Any,
    *args: Any,
    label: str,
    timeout: float = 30.0,
    **kwargs: Any,
) -> Any:
    """Async JPype wrapper that abandons a hung call instead of pinning a worker.

    Like :func:`run_in_jvm_thread`, but the blocking call runs on an
    abandonable daemon thread (see :func:`_run_jvm_subtask`): if it exceeds
    ``timeout`` the pool worker is freed immediately and the still-running
    native call is bounded by the shared in-flight semaphore. Use this for
    user-reachable CDK calls whose worst case is an uninterruptible hang on a
    pathological molecule (substructure matching, depiction, SMILES/InChI
    generation). Plain :func:`run_in_jvm_thread` -- which holds the worker until
    the call returns -- is fine for calls with a naturally bounded runtime.

    Args:
        fn: The blocking callable to execute (typically a JPype/CDK call).
        *args: Positional arguments passed to ``fn``.
        timeout: Seconds before the daemon is abandoned and TimeoutError raised.
        label: Short name for logging and the busy/timeout messages.
        **kwargs: Keyword arguments passed to ``fn``.

    Returns:
        The return value of ``fn(*args, **kwargs)``.

    Raises:
        TimeoutError: If the call exceeds ``timeout`` or the in-flight cap is
            hit (both map to 503).
        RuntimeError: If the thread pool is not initialized.
    """

    def _outer() -> Any:
        return _run_jvm_subtask(lambda: fn(*args, **kwargs), timeout, label)

    # The pool worker only blocks on the daemon's completion event; the daemon
    # does the Java work. Give the outer guard headroom so the inner
    # (worker-freeing) TimeoutError surfaces first.
    return await run_in_jvm_thread(_outer, timeout=timeout + _ABANDON_OUTER_BUFFER)
