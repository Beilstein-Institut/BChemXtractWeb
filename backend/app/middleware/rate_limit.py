"""Per-IP rate limiting backed by slowapi.

Two-layer design:

1. **Global default** applied by :class:`SlowAPIMiddleware` so every route
   has a baseline ceiling even if a developer forgets a per-route decorator.
2. **Per-route overrides** via ``@limiter.limit(settings.rate_limit_*)``
   decorators on expensive endpoints (extract, reactions, batch, search,
   export).

Storage defaults to ``memory://`` which is per-process — safe for a
single-replica backend. Scaling out horizontally requires flipping
``RATE_LIMIT_STORAGE_URI`` to a ``redis://`` URL so all workers share the
counters. No code changes are required for that switch.

The ``429`` error response is normalised through the unified
``ErrorResponse`` shape via ``app.errors.rate_limit_exceeded_handler`` so the
frontend sees the same JSON contract as every other 4xx.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

# Use X-Forwarded-For when behind the nginx reverse proxy so per-IP counts
# reflect the real client, not the proxy. slowapi's get_remote_address reads
# `Request.client.host` which, with uvicorn's `--proxy-headers`, correctly
# unwraps XFF. Deployment must set `uvicorn --proxy-headers --forwarded-allow-ips=<lan>`
# for this to be safe (otherwise a client can spoof XFF).
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.rate_limit_default],
    storage_uri=settings.rate_limit_storage_uri,
    # `headers_enabled=False` on purpose: when True, slowapi tries to
    # inject X-RateLimit-* headers into the endpoint's return value and
    # requires that return to be a ``starlette.responses.Response`` instance.
    # Our production endpoints return Pydantic models which FastAPI wraps
    # later, incompatible with that requirement. The unified
    # ``rate_limit_exceeded_handler`` (app.errors) still emits the critical
    # ``Retry-After`` header on 429s, and clients receive budget information
    # through the body + status code, which is sufficient for well-behaved
    # consumers.
    headers_enabled=False,
)
