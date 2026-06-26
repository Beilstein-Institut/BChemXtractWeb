"""Ownership binding for async jobs (batch + single-file extraction).

Both the batch endpoints and the async single-file extraction endpoints address
a job purely by an opaque Celery id (a GroupResult.id or an AsyncResult.id) that
lives in Celery/Redis and carries no Postgres RLS. Without binding that id to the
scope that created the job, any party holding the id could stream another
session's progress or cancel/poll its work (IDOR, CWE-639). These helpers record
and verify that binding under a single ``bcx:job-owner:<id>`` namespace shared by
every job kind.

Lives in the services layer (not in a router) so both routers and the worker
task layer can use it without a routers->tasks->routers import cycle.
"""

from __future__ import annotations

from fastapi import HTTPException, Request

from app.celery_app import celery_app

_JOB_OWNER_KEY_PREFIX = "bcx:job-owner:"


def owner_store():
    """Return the Redis client backing the job-ownership records.

    Indirection point so tests can substitute an in-memory fake without a live
    Redis. Uses the Celery result backend's client — the same store the
    GroupResult/AsyncResult live in — so ownership records share its lifetime.
    """
    return celery_app.backend.client


def scope_owner_token(session_id: str | None, api_key_hash: bytes | None) -> str:
    """Stable string identity for a request scope.

    Binds a job to the session cookie or API key that created it. API-key scope
    takes precedence over a session id, mirroring ``get_scoped_db``.
    """
    if api_key_hash is not None:
        return f"akh:{api_key_hash.hex()}"
    if session_id is not None:
        return f"sid:{session_id}"
    return "anon:"


def job_owner_key(job_id: str) -> str:
    return f"{_JOB_OWNER_KEY_PREFIX}{job_id}"


def record_job_owner(job_id: str, token: str) -> None:
    """Persist the job-owner token with the same TTL as the Celery result."""
    ttl = int(celery_app.conf.result_expires or 3600)
    owner_store().set(job_owner_key(job_id), token, ex=ttl)


def require_job_owner(job_id: str, request: Request) -> None:
    """Raise 404 unless the caller's scope matches the recorded job owner.

    A missing or foreign owner record is reported identically to a genuinely
    absent job so the endpoint cannot be used to probe which ids exist.
    """
    scope = getattr(request.state, "scope", (None, None))
    expected = scope_owner_token(*scope)
    stored = owner_store().get(job_owner_key(job_id))
    if stored is None:
        raise HTTPException(status_code=404, detail="Not found")
    stored_token = stored.decode() if isinstance(stored, bytes) else str(stored)
    if stored_token != expected:
        raise HTTPException(status_code=404, detail="Not found")
