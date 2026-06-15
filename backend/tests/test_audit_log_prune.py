"""audit_log retention prune Celery beat task.

Exercises ``app.tasks.audit_log.prune_old_entries`` in Celery eager mode
(``task_always_eager=True``) so the test runs the real task body without
needing a live Redis broker. The task itself opens its own
``AsyncSessionLocal`` to issue the ``DELETE`` — therefore the tests
seed rows via ``AsyncSessionLocal`` directly (not via the ``db_session``
fixture, whose engine is the same DB but a separate ``AsyncSession``
with its own transaction lifecycle).

Run:
    conda run -n cheminformatics pytest backend/tests/test_audit_log_prune.py -x -q
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import delete, func, select

from app.models.orm import AuditLog
from app.services.db import AsyncSessionLocal


@pytest.fixture(autouse=True)
def celery_eager_memory(monkeypatch):
    """Force the Celery app into eager + in-memory mode for the duration of a
    test. Mirrors ``test_celery_tasks.celery_eager_memory`` exactly so the
    prune task runs synchronously in the calling process — no Redis broker,
    no worker process.
    """
    monkeypatch.setenv("CELERY_BROKER_URL", "memory://")
    monkeypatch.setenv("CELERY_RESULT_BACKEND", "cache+memory://")

    from app.celery_app import celery_app

    celery_app.conf.update(
        task_always_eager=True,
        task_eager_propagates=True,
        broker_url="memory://",
        result_backend="cache+memory://",
    )
    yield
    # Restore the production defaults so subsequent tests get a clean Celery
    # config. Note: the worker_pool / beat_schedule keys are left untouched —
    # only the eager/broker knobs were flipped above.
    celery_app.conf.update(
        task_always_eager=False,
        broker_url="redis://redis:6379/0",
        result_backend="redis://redis:6379/1",
    )


@pytest_asyncio.fixture
async def cleanup_audit_log():
    """Wipe the ``audit_log`` table before AND after each test.

    The prune task opens its own ``AsyncSessionLocal`` against the same DB
    the conftest seeds (``bchemxtract_test``). Any rows seeded during the
    test must be removed afterward or they pollute the other audit tests
    (``test_audit_log.py``) that count rows by event.
    """
    async with AsyncSessionLocal() as db:
        await db.execute(delete(AuditLog))
        await db.commit()
    yield
    async with AsyncSessionLocal() as db:
        await db.execute(delete(AuditLog))
        await db.commit()


async def _count_audit_rows() -> int:
    async with AsyncSessionLocal() as db:
        return int((await db.execute(select(func.count(AuditLog.id)))).scalar_one())


async def _seed_audit_row(event: str, at: datetime) -> int:
    """Insert one ``AuditLog`` row at the given timestamp and return its id."""
    async with AsyncSessionLocal() as db:
        row = AuditLog(event=event, at=at)
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row.id


@pytest.mark.asyncio
async def test_prune_removes_rows_older_than_retention(cleanup_audit_log):
    """A row older than ``audit_log_retention_days`` is deleted; a fresh row
    survives.
    """
    now = datetime.now(UTC)
    stale_id = await _seed_audit_row("auth.session.created", now - timedelta(days=400))
    fresh_id = await _seed_audit_row("auth.session.created", now - timedelta(days=7))

    from app.tasks.audit_log import prune_old_entries

    result = prune_old_entries.apply().get()
    assert isinstance(result, dict)
    assert result["deleted_count"] >= 1, result

    async with AsyncSessionLocal() as db:
        remaining_ids = {
            r.id for r in (await db.execute(select(AuditLog))).scalars().all()
        }
    assert stale_id not in remaining_ids, (
        f"stale row id={stale_id} should have been pruned"
    )
    assert fresh_id in remaining_ids, (
        f"fresh row id={fresh_id} (7 days old) must NOT be pruned"
    )


@pytest.mark.asyncio
async def test_prune_is_idempotent(cleanup_audit_log):
    """Running prune twice with no new stale rows reports zero deletions on
    the second invocation.
    """
    from app.tasks.audit_log import prune_old_entries

    now = datetime.now(UTC)
    await _seed_audit_row("extraction.deleted", now - timedelta(days=400))

    r1 = prune_old_entries.apply().get()
    assert r1["deleted_count"] >= 1, r1

    r2 = prune_old_entries.apply().get()
    assert r2["deleted_count"] == 0, (
        f"second prune should be a no-op but reported {r2['deleted_count']} deletions"
    )


@pytest.mark.asyncio
async def test_prune_respects_audit_log_retention_days(cleanup_audit_log, monkeypatch):
    """Lowering ``audit_log_retention_days`` to 30 prunes rows older than 30
    days; rows newer than 30 days survive.
    """
    from app.config import settings
    from app.tasks.audit_log import prune_old_entries

    monkeypatch.setattr(settings, "audit_log_retention_days", 30)

    now = datetime.now(UTC)
    sixty_id = await _seed_audit_row("auth.session.created", now - timedelta(days=60))
    ten_id = await _seed_audit_row("auth.session.created", now - timedelta(days=10))

    result = prune_old_entries.apply().get()
    assert result["deleted_count"] >= 1, result

    async with AsyncSessionLocal() as db:
        remaining_ids = {
            r.id for r in (await db.execute(select(AuditLog))).scalars().all()
        }
    assert sixty_id not in remaining_ids, (
        f"60-day-old row id={sixty_id} should have been pruned at 30-day retention"
    )
    assert ten_id in remaining_ids, (
        f"10-day-old row id={ten_id} must survive 30-day retention"
    )

    # Sanity: every remaining row was inserted within the last 30 days.
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(AuditLog))).scalars().all()
    for r in rows:
        assert (now - r.at).days < 30, (
            f"row id={r.id} at={r.at} survived a 30-day prune — age "
            f"{(now - r.at).days} days >= 30"
        )

    # _count_audit_rows is exercised here too so the import stays live.
    assert await _count_audit_rows() == len(rows)
