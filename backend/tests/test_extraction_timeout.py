"""Stage-1 extraction timeout guards (JPype pool-exhaustion DoS).

A CDK SMILES/depiction call that hangs on a crafted graph must not pin the
calling JPype pool worker. ``_extract_with_fallback_sync`` runs Stage 1 on a
daemon thread with a hard timeout so the worker is freed (503) instead of
being held until the call returns or forever.
"""

from __future__ import annotations

import time

import pytest

from app.services import extractor
from app.services.extractor import _run_jvm_subtask
from app.services.jvm_bridge import run_in_jvm_thread

pytestmark = pytest.mark.asyncio


async def test_run_jvm_subtask_returns_value() -> None:
    assert _run_jvm_subtask(lambda: 21, 5.0, "test") == 21


async def test_run_jvm_subtask_propagates_error() -> None:
    def boom():
        raise ValueError("nope")

    with pytest.raises(ValueError, match="nope"):
        _run_jvm_subtask(boom, 5.0, "test")


async def test_run_jvm_subtask_times_out_quickly() -> None:
    """A blocking call is abandoned at the timeout, not waited out in full."""
    t0 = time.perf_counter()
    with pytest.raises(TimeoutError):
        _run_jvm_subtask(lambda: time.sleep(10), 0.2, "test")  # daemon, leaks
    assert time.perf_counter() - t0 < 2.0


async def test_stage1_hang_times_out_and_frees_pool_worker(
    started_app, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A hung Stage 1 raises TimeoutError fast (not after 60s) AND leaves the
    JPype pool able to serve the next call — i.e. the worker was reclaimed."""

    def _hang(*_a, **_k):
        time.sleep(30)

    # Patch the parse step to hang and shrink the Stage-1 budget.
    monkeypatch.setattr(extractor, "_read_document", _hang)
    monkeypatch.setattr(extractor, "_FRAGMENT_STAGE1_TIMEOUT", 0.3)

    t0 = time.perf_counter()
    with pytest.raises(TimeoutError):
        await run_in_jvm_thread(
            extractor._extract_with_fallback_sync, b"x", "cdx", timeout=5.0
        )
    assert time.perf_counter() - t0 < 3.0, "Stage 1 hang was not bounded"

    # The pool worker must be free for subsequent work despite the leaked
    # (still-sleeping) Stage-1 daemon thread.
    assert await run_in_jvm_thread(lambda: 7) == 7
