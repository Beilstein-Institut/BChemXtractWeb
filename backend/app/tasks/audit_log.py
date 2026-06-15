"""Audit-log prune Celery beat task.

Daily at 03:00 UTC, delete ``audit_log`` rows older than
``Settings.audit_log_retention_days`` (default 365 days).

Idempotent: re-running on the same day removes zero additional rows.
A single beat scheduler in the deployment ensures the cron is not
double-fired (Docker Compose `celery-beat` service).
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import logging
from collections.abc import Coroutine
from datetime import UTC, datetime, timedelta
from typing import TypeVar

from sqlalchemy import delete

from app.celery_app import celery_app
from app.config import settings
from app.models.orm import AuditLog
from app.services.db import AsyncSessionLocal

logger = logging.getLogger(__name__)

_T = TypeVar("_T")


def _run_async(coro: Coroutine[None, None, _T]) -> _T:
    """Run an async coroutine to completion from sync code.

    Celery worker processes have no event loop → ``asyncio.run`` works.
    pytest-asyncio harness DOES have a running loop → ``asyncio.run``
    raises ``RuntimeError: cannot be called from a running event loop``.
    Fall back to a one-shot thread so the test path works without
    changing the production path.
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


@celery_app.task(bind=True, name="audit_log.prune_old_entries")
def prune_old_entries(self) -> dict:
    """Delete audit_log rows older than retention. No JVM — pure SQL."""

    async def _prune() -> int:
        cutoff = datetime.now(UTC) - timedelta(days=settings.audit_log_retention_days)
        async with AsyncSessionLocal() as db:
            result = await db.execute(delete(AuditLog).where(AuditLog.at < cutoff))
            await db.commit()
            return result.rowcount or 0

    deleted = _run_async(_prune())
    logger.info("audit_log prune: removed %d rows older than retention", deleted)
    return {"deleted_count": deleted}
