"""Per-session rate limiting via slowapi.

The slowapi ``key_func`` resolves the limit bucket from the incoming
request. The resolution order is

    session_id (bcx_sid cookie, UUID4-validated)
        > api_key_hash (X-API-Key header, truncated PBKDF2 hash prefix)
            > client IP (slowapi default, last-resort fallback)

The function is **synchronous** — slowapi calls ``key_func(request)``
without awaiting (see ``slowapi/extension.py``). An async key_func would
silently return a coroutine object and slowapi would crash or bucket on
``str(coroutine_obj)``. The PBKDF2 lookup hash is also a synchronous
hashlib call (releases the GIL), so the whole resolver is non-blocking
from the event-loop's perspective.

Per-route decorators (``@limiter.limit(settings.rate_limit_upload)``,
etc.) inherit the global key_func unless they pass ``key_func=``
explicitly — none currently do, so the existing per-route limits in
``routers/extract.py``, ``reactions.py``, ``batch.py``, ``search.py``,
``export.py``, and ``admin_api_keys.py`` partition by the new precedence
automatically. Admin endpoints carry no cookie and may carry no
X-API-Key, so ``rate_limit_key`` falls through to the per-IP bucket —
preserving the "5/minute per IP" rate ceiling for admin without any
per-route override.

Storage defaults to ``memory://`` for single-replica deployments. With
``memory://`` each replica keeps its own in-process counters, so scaling
horizontally requires flipping ``RATE_LIMIT_STORAGE_URI`` to a
``redis://`` URL so all workers share the counters. No code changes are
required for that switch.

The ``429`` error response is normalised through the unified
``ErrorResponse`` shape via ``app.errors.rate_limit_exceeded_handler``.
"""

from __future__ import annotations

import re

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.core.security import hash_api_key_for_lookup

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)


def rate_limit_key(request: Request) -> str:
    """slowapi key_func — MUST be synchronous.

    Precedence:
      1. ``bcx_sid`` cookie, validated as a UUID4 → ``sid:<uuid>``.
      2. ``X-API-Key`` header → ``akh:<first 16 hex>``. The 16-hex
         (8-byte / 64-bit) truncation is bucket-partition-only — it
         identifies the same key across requests without putting the
         full lookup hash into logs. Authentication of the key still
         happens at the request-scope dependency (``get_scoped_db``
         validates X-API-Key against the api_keys table); this prefix
         is opaque to clients.
      3. Fallback → ``ip:<client ip>`` (slowapi default). Same numerical
         ceiling as the cookie/akh buckets, so a client that clears the
         cookie cannot escape rate limiting.
    """
    sid = request.cookies.get("bcx_sid")
    if sid and _UUID_RE.match(sid):
        return f"sid:{sid}"

    api_key = request.headers.get("X-API-Key")
    if api_key:
        return f"akh:{hash_api_key_for_lookup(api_key)[:16]}"

    return f"ip:{get_remote_address(request)}"


# Use X-Forwarded-For when behind the nginx reverse proxy so per-IP counts
# reflect the real client, not the proxy. slowapi's get_remote_address reads
# `Request.client.host` which, with uvicorn's `--proxy-headers`, correctly
# unwraps XFF. Deployment must set `uvicorn --proxy-headers --forwarded-allow-ips=<lan>`
# for this to be safe (otherwise a client can spoof XFF). The IP path is
# the last-resort fallback inside ``rate_limit_key``.
limiter = Limiter(
    key_func=rate_limit_key,
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
