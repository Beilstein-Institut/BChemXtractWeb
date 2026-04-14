"""API-layer tests for history and stats endpoints (Phase 5).

Requirements: HIST-01, HIST-02, HIST-04
Uses the `client` fixture (lifespan-started app + JVM) from conftest.py.

Run: conda run -n cheminformatics pytest tests/test_history_api.py -x -q
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_history_list_returns_200(client: AsyncClient):
    """HIST-01: GET /api/history returns 200 with items and total fields."""
    response = await client.get("/api/history")
    assert response.status_code == 200
    body = response.json()
    assert "items" in body, "Response must have 'items' key"
    assert "total" in body, "Response must have 'total' key"
    assert isinstance(body["items"], list)
    assert isinstance(body["total"], int)


@pytest.mark.asyncio
async def test_history_list_default_limit(client: AsyncClient):
    """D-05: default limit is 10 — items list never exceeds 10 entries."""
    response = await client.get("/api/history")
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) <= 10


@pytest.mark.asyncio
async def test_history_list_item_fields(client: AsyncClient):
    """HIST-01: each item has id, filename, structure_count, created_at."""
    response = await client.get("/api/history")
    assert response.status_code == 200
    items = response.json()["items"]
    for item in items:
        assert "id" in item
        assert "filename" in item
        assert "structure_count" in item
        assert "created_at" in item


@pytest.mark.asyncio
async def test_history_detail_not_found(client: AsyncClient):
    """HIST-02: GET /api/history/{id} returns 404 for non-existent ID."""
    response = await client.get("/api/history/999999999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_history_not_found(client: AsyncClient):
    """D-07: DELETE /api/history/{id} returns 404 for non-existent ID."""
    response = await client.delete("/api/history/999999999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_stats_returns_200(client: AsyncClient):
    """HIST-04: GET /api/stats returns 200 with all three stat fields."""
    response = await client.get("/api/stats")
    assert response.status_code == 200
    body = response.json()
    assert "total_extractions" in body
    assert "unique_structures" in body
    assert "most_common_formula" in body
    assert isinstance(body["total_extractions"], int)
    assert isinstance(body["unique_structures"], int)
    assert isinstance(body["most_common_formula"], str)


@pytest.mark.asyncio
async def test_stats_empty_formula_is_string(client: AsyncClient):
    """D-08: most_common_formula is empty string (not null) when no substances exist."""
    response = await client.get("/api/stats")
    assert response.status_code == 200
    body = response.json()
    # Even on empty DB, most_common_formula must be a string (never null)
    assert body["most_common_formula"] is not None
    assert isinstance(body["most_common_formula"], str)


@pytest.mark.asyncio
async def test_history_all_limit(client: AsyncClient):
    """D-05: GET /api/history?limit=all returns total items without cap."""
    response = await client.get("/api/history?limit=all")
    assert response.status_code == 200
    body = response.json()
    assert "items" in body
    # all items should equal total
    assert len(body["items"]) == body["total"]
