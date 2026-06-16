"""Unit tests for the in-process TokenBucket — uses an injected clock and a
recording sleep so no real time passes."""

import pytest

from app.services.pubchem import TokenBucket


@pytest.mark.asyncio
async def test_first_calls_within_capacity_do_not_sleep():
    clock = {"t": 0.0}
    slept: list[float] = []

    async def fake_sleep(d):
        slept.append(d)

    bucket = TokenBucket(rate_per_sec=4.0, now=lambda: clock["t"], sleep=fake_sleep)
    # Capacity == rate, so the first 4 acquisitions are free at t=0.
    for _ in range(4):
        await bucket.acquire()
    assert slept == []


@pytest.mark.asyncio
async def test_exceeding_rate_sleeps_for_refill():
    clock = {"t": 0.0}
    slept: list[float] = []

    async def fake_sleep(d):
        slept.append(d)
        clock["t"] += d  # advance the clock as if we waited

    bucket = TokenBucket(rate_per_sec=4.0, now=lambda: clock["t"], sleep=fake_sleep)
    for _ in range(4):
        await bucket.acquire()
    # 5th token requires waiting ~1/4 s for one token to refill.
    await bucket.acquire()
    assert len(slept) == 1
    assert slept[0] == pytest.approx(0.25, abs=1e-6)
