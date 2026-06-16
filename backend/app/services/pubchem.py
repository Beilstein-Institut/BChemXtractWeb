"""PubChem PUG REST client + in-process rate limiter.

Pure I/O — no DB, no FastAPI. The backend runs as a single uvicorn process
(JVM-per-process constraint), so a per-process token bucket bounds the whole
backend's PubChem request rate. Swap for a Redis-backed limiter only if the
backend is ever scaled to multiple processes.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable


class TokenBucket:
    """Async token bucket. Capacity == rate (one second of burst)."""

    def __init__(
        self,
        rate_per_sec: float,
        now: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._rate = rate_per_sec
        self._capacity = rate_per_sec
        self._tokens = rate_per_sec
        self._now = now
        self._sleep = sleep
        self._updated = now()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Block until one token is available, then consume it."""
        async with self._lock:
            self._refill()
            if self._tokens < 1.0:
                deficit = 1.0 - self._tokens
                wait = deficit / self._rate
                await self._sleep(wait)
                self._refill()
            self._tokens -= 1.0

    def _refill(self) -> None:
        t = self._now()
        elapsed = t - self._updated
        if elapsed > 0:
            self._tokens = min(self._capacity, self._tokens + elapsed * self._rate)
            self._updated = t
