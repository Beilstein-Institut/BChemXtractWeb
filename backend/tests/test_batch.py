"""Tests for GET /api/batch/{batch_id} — batch extraction summaries.

Tests follow the established seeding pattern: rows are inserted via
AsyncSessionLocal + set_config('app.session_id', ...) so Postgres RLS
WITH CHECK constraints are satisfied on insert.

Run: conda run -n cheminformatics pytest tests/test_batch.py -v
"""

from __future__ import annotations

import dataclasses
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, text

from app.models.orm import Extraction
from app.services import job_ownership as jo
from app.services.db import AsyncSessionLocal
from tests.conftest import TEST_SESSION_COOKIE, skip_under_superuser_db

pytestmark = pytest.mark.asyncio

# A second session UUID distinct from TEST_SESSION_COOKIE.
OTHER_SESSION_COOKIE = "22222222-2222-4222-8222-222222222222"


@dataclasses.dataclass
class SeededBatch:
    """Minimal descriptor for a batch seeded into the test DB."""

    batch_id: str
    extraction_ids: list[int]


@pytest_asyncio.fixture
async def seeded_batch() -> SeededBatch:
    """Insert 3 Extraction rows with the same batch_id under TEST_SESSION_COOKIE.

    Files: "simple.cdx" (3 structs), "mid.cdx" (2), "big.cdx" (12).
    Rows are inserted in order; IDs are monotonically increasing, so
    ORDER BY id in the endpoint returns them in insertion order.

    Teardown deletes all inserted rows keyed by batch_id so repeated local
    pytest runs against a persistent Postgres don't accumulate stale rows.
    """
    batch_id = str(uuid.uuid4())
    files = [
        ("simple.cdx", 3),
        ("mid.cdx", 2),
        ("big.cdx", 12),
    ]
    ids: list[int] = []
    async with AsyncSessionLocal() as db:
        await db.execute(
            text("SELECT set_config('app.session_id', :sid, true)"),
            {"sid": TEST_SESSION_COOKIE},
        )
        for filename, structure_count in files:
            row = Extraction(
                session_id=TEST_SESSION_COOKIE,
                api_key_hash=None,
                filename=filename,
                file_size=100,
                format="cdx",
                structure_count=structure_count,
                extraction_time_ms=1.0,
                reaction_count=0,
                warnings=[],
                batch_id=batch_id,
            )
            db.add(row)
            await db.flush()
            ids.append(row.id)
        await db.commit()

    yield SeededBatch(batch_id=batch_id, extraction_ids=ids)

    async with AsyncSessionLocal() as db:
        await db.execute(
            text("SELECT set_config('app.session_id', :sid, true)"),
            {"sid": TEST_SESSION_COOKIE},
        )
        await db.execute(delete(Extraction).where(Extraction.batch_id == batch_id))
        await db.commit()


@pytest_asyncio.fixture
async def other_session_client(started_app) -> AsyncClient:
    """Async HTTP client authenticated as a different session (OTHER_SESSION_COOKIE).

    Used to verify RLS isolation: this client must not see rows owned by
    TEST_SESSION_COOKIE.
    """
    transport = ASGITransport(app=started_app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"bcx_sid": OTHER_SESSION_COOKIE},
    ) as ac:
        yield ac


async def test_get_batch_extractions_returns_files_in_order(
    client: AsyncClient, seeded_batch: SeededBatch
):
    """GET /api/batch/{batch_id} returns 200 with files in insertion order."""
    resp = await client.get(f"/api/batch/{seeded_batch.batch_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["batch_id"] == seeded_batch.batch_id
    names = [f["filename"] for f in body["files"]]
    assert names == ["simple.cdx", "mid.cdx", "big.cdx"]
    assert body["files"][0]["structure_count"] == 3
    assert all("extraction_id" in f for f in body["files"])


async def test_get_batch_extractions_404_when_empty(client: AsyncClient):
    """GET /api/batch/{batch_id} returns 404 when no rows match the batch_id."""
    resp = await client.get("/api/batch/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


@skip_under_superuser_db
async def test_get_batch_extractions_rls_isolated(
    client: AsyncClient,
    other_session_client: AsyncClient,
    seeded_batch: SeededBatch,
):
    """A different session must not see another session's batch (RLS isolation)."""
    resp = await other_session_client.get(f"/api/batch/{seeded_batch.batch_id}")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Batch group_id ownership — the SSE-progress and cancel endpoints key on the
# Celery group_id and touch only Celery/Redis (no RLS), so they must verify
# the caller owns the batch (IDOR, CWE-639). These tests substitute an
# in-memory owner store + GroupResult so no live Redis/Celery is needed.
# ---------------------------------------------------------------------------


class _FakeOwnerStore:
    """Minimal Redis stand-in for the batch-owner records."""

    def __init__(self) -> None:
        self._d: dict[str, bytes] = {}

    def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._d[key] = value.encode() if isinstance(value, str) else value

    def get(self, key: str) -> bytes | None:
        return self._d.get(key)


class _FakeGroupResult:
    """GroupResult stand-in whose ``restore`` yields no member tasks."""

    results: list = []

    @staticmethod
    def restore(group_id: str, app: object = None) -> _FakeGroupResult:
        return _FakeGroupResult()


async def test_scope_owner_token_precedence() -> None:
    """API-key hash wins over session id; anonymous falls back to a sentinel."""
    from app.services.job_ownership import scope_owner_token

    assert scope_owner_token("sid-1", None) == "sid:sid-1"
    assert scope_owner_token("sid-1", b"\xab\xcd") == "akh:abcd"
    assert scope_owner_token(None, None) == "anon:"


async def test_cancel_batch_foreign_owner_404(
    client_csrf: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Cancelling a batch owned by another session returns 404 (not 403, to
    avoid leaking that the group_id exists)."""

    store = _FakeOwnerStore()
    store.set(jo.job_owner_key("grp-foreign"), f"sid:{OTHER_SESSION_COOKIE}")
    monkeypatch.setattr(jo, "owner_store", lambda: store)

    resp = await client_csrf.delete("/api/batch/grp-foreign")
    assert resp.status_code == 404


async def test_cancel_batch_unknown_group_404(
    client_csrf: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Cancelling an unrecorded group_id returns 404."""

    monkeypatch.setattr(jo, "owner_store", lambda: _FakeOwnerStore())

    resp = await client_csrf.delete("/api/batch/never-seen")
    assert resp.status_code == 404


async def test_cancel_batch_owner_succeeds(
    client_csrf: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The owning session can cancel its own batch (204)."""
    from app.routers import batch as batch_mod

    store = _FakeOwnerStore()
    store.set(jo.job_owner_key("grp-mine"), f"sid:{TEST_SESSION_COOKIE}")
    monkeypatch.setattr(jo, "owner_store", lambda: store)
    monkeypatch.setattr(batch_mod, "GroupResult", _FakeGroupResult)

    resp = await client_csrf.delete("/api/batch/grp-mine")
    assert resp.status_code == 204


async def test_cancel_batch_sets_flag_even_when_group_meta_missing(
    client_csrf: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Cancel sets the cooperative flag and 204s even if the GroupResult meta
    has expired from Redis — the worker's per-file flag is the real stop, so a
    restore miss must not block cancellation."""
    from app.celery_app import batch_cancel_key
    from app.routers import batch as batch_mod

    store = _FakeOwnerStore()
    store.set(jo.job_owner_key("grp-gone"), f"sid:{TEST_SESSION_COOKIE}")
    monkeypatch.setattr(jo, "owner_store", lambda: store)

    class _MissingGroupResult:
        @staticmethod
        def restore(group_id: str, app: object = None):
            return None

    monkeypatch.setattr(batch_mod, "GroupResult", _MissingGroupResult)

    resp = await client_csrf.delete("/api/batch/grp-gone")
    assert resp.status_code == 204
    assert store.get(batch_cancel_key("grp-gone")) is not None


async def test_batch_progress_foreign_owner_404(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """SSE progress for another session's batch returns 404 before the stream
    opens (no per-file results leak)."""

    store = _FakeOwnerStore()
    store.set(jo.job_owner_key("grp-foreign2"), f"sid:{OTHER_SESSION_COOKIE}")
    monkeypatch.setattr(jo, "owner_store", lambda: store)

    resp = await client.get("/api/batch/grp-foreign2/progress")
    assert resp.status_code == 404
