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
