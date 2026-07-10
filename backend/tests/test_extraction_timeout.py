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
from app.services.jvm_bridge import _run_jvm_subtask, run_in_jvm_thread

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


async def test_run_jvm_subtask_caps_concurrent_daemons(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When the in-flight slot pool is exhausted, a new subtask fails fast with
    TimeoutError instead of spawning an unbounded daemon."""
    import threading

    # Shrink the cap to 1 with a fresh semaphore so the test is deterministic.
    # The semaphore lives in jvm_bridge now (shared by every abandonable call).
    monkeypatch.setattr(
        "app.services.jvm_bridge._jvm_subtask_slots", threading.BoundedSemaphore(1)
    )

    # Occupy the only slot with a still-running (abandoned) daemon.
    with pytest.raises(TimeoutError, match="exceeded"):
        _run_jvm_subtask(lambda: time.sleep(10), 0.2, "occupier")

    # The occupier's daemon is still sleeping, holding the permit -> the next
    # call is refused immediately (not after its own timeout).
    t0 = time.perf_counter()
    with pytest.raises(TimeoutError, match="busy"):
        _run_jvm_subtask(lambda: 1, 5.0, "rejected")
    assert time.perf_counter() - t0 < 0.5, "should refuse fast, not wait the timeout"


async def test_enrich_inchi_does_not_mutate_input() -> None:
    """The recovery returns copies; the input dicts are never written to (so an
    abandoned daemon can't race the returned/persisted result)."""
    original = [
        {
            "smiles": "c1ccccc1",
            "inchi": "",
            "inchi_key": "",
            "molecular_formula": "C6H6",
        }
    ]
    snapshot = [dict(d) for d in original]
    result = extractor._enrich_inchi_from_smiles_sync(original)
    # Input is untouched regardless of whether CDK is available in this env.
    assert original == snapshot
    assert result is not original
    assert result[0] is not original[0]


async def test_compute_inchi_rejects_oversized_smiles() -> None:
    """A SMILES past the on-demand cap is refused before touching the JVM."""
    huge = "C" * (extractor._MAX_ON_DEMAND_SMILES_LEN + 1)
    assert await extractor.compute_inchi(huge) == ("", "")
