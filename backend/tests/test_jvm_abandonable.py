"""Abandonable JVM-thread wrapper: a hung CDK call frees the pool worker.

``run_in_jvm_thread`` pins its pool worker until the (uninterruptible) Java
call returns -- so a CDK call that hangs on a pathological molecule
(substructure match / depiction / SMILES generation) pins a worker forever and
a few crafted requests exhaust the fixed JPype pool (CWE-400).

``run_in_jvm_thread_abandonable`` runs the call on a daemon thread that is
abandoned at the timeout, so the pool worker is reclaimed immediately and the
abandoned native call is bounded by the shared in-flight semaphore.
"""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.services import jvm_bridge
from app.services.jvm_bridge import (
    _run_jvm_subtask,
    run_in_jvm_thread,
    run_in_jvm_thread_abandonable,
)

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _jvm_pool(monkeypatch: pytest.MonkeyPatch):
    """Give the bridge a real thread pool without starting the JVM.

    Mirrors ``test_run_in_jvm_thread_timeout``: patch ``_executor`` directly so
    these tests exercise the pool logic deterministically and JVM-free. Tests
    that need a specific pool size (e.g. the worker-freeing proof) re-patch it.
    """
    pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="test-jpype")
    monkeypatch.setattr("app.services.jvm_bridge._executor", pool)
    yield pool
    pool.shutdown(wait=False, cancel_futures=True)


async def test_abandonable_returns_value() -> None:
    assert await run_in_jvm_thread_abandonable(lambda: 21, label="t") == 21


async def test_abandonable_forwards_args() -> None:
    def add(a: int, b: int) -> int:
        return a + b

    assert await run_in_jvm_thread_abandonable(add, 3, b=7, label="t") == 10


async def test_abandonable_propagates_error() -> None:
    def boom() -> None:
        raise ValueError("nope")

    with pytest.raises(ValueError, match="nope"):
        await run_in_jvm_thread_abandonable(boom, label="t")


async def test_hung_call_frees_pool_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    """A hung call is abandoned at the timeout AND the single pool worker is
    reclaimed for the next call -- the guarantee plain run_in_jvm_thread lacks.

    Uses a max_workers=1 pool: if the hung call still pinned the worker, the
    follow-up call could not run and would itself time out.
    """
    tiny_pool = ThreadPoolExecutor(max_workers=1)
    monkeypatch.setattr("app.services.jvm_bridge._executor", tiny_pool)
    # Throwaway semaphore so the abandoned daemon's permit isn't leaked from the
    # real budget into later tests (the daemon outlives this test).
    monkeypatch.setattr(
        "app.services.jvm_bridge._jvm_subtask_slots", threading.BoundedSemaphore(16)
    )
    try:
        t0 = time.perf_counter()
        with pytest.raises(TimeoutError):
            await run_in_jvm_thread_abandonable(
                lambda: time.sleep(2), timeout=0.2, label="hang"
            )
        assert time.perf_counter() - t0 < 2.0, "hang was not bounded"

        # The single worker must be free despite the still-sleeping daemon.
        assert await run_in_jvm_thread(lambda: 7, timeout=2.0) == 7
    finally:
        tiny_pool.shutdown(wait=False, cancel_futures=True)


async def test_subtask_releases_permit_when_thread_start_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If spawning the daemon fails after the slot is acquired, the permit must
    be released -- otherwise the in-flight budget bleeds down permanently and
    eventually every JVM subtask fails with 'JVM is busy'.
    """
    monkeypatch.setattr(
        "app.services.jvm_bridge._jvm_subtask_slots", threading.BoundedSemaphore(1)
    )

    class _ExplodingThread:
        def __init__(self, *a, **k) -> None:
            pass

        def start(self) -> None:
            raise RuntimeError("can't start new thread")

    monkeypatch.setattr("app.services.jvm_bridge.threading.Thread", _ExplodingThread)

    with pytest.raises(RuntimeError, match="can't start new thread"):
        _run_jvm_subtask(lambda: 1, 5.0, "boom")

    # The only slot must be free again -- the failed start released its permit.
    assert jvm_bridge._jvm_subtask_slots.acquire(blocking=False) is True
