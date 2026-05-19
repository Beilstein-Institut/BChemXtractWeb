"""Tests for POST /api/search/validate (Plan 2026-04-24)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_validate_smiles(client_csrf: AsyncClient):
    resp = await client_csrf.post(
        "/api/search/validate",
        json={"query": "c1ccccc1"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is True
    assert body["language"] == "smiles"
    assert body["atom_count"] == 6
    assert body["error"] is None


@pytest.mark.asyncio
async def test_validate_smarts(client_csrf: AsyncClient):
    resp = await client_csrf.post(
        "/api/search/validate",
        json={"query": "[CX3]=O"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is True
    assert body["language"] == "smarts"
    assert body["atom_count"] == 2


@pytest.mark.asyncio
async def test_validate_invalid_returns_200_with_error(client_csrf: AsyncClient):
    resp = await client_csrf.post(
        "/api/search/validate",
        json={"query": "c1ccc((("},
    )
    # Invalid *content* returns 200 with valid=false (not 4xx) so the
    # frontend can show an inline error without triggering error toasts.
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is False
    assert body["language"] is None
    assert body["error"]


@pytest.mark.asyncio
async def test_validate_empty_query_returns_422(client_csrf: AsyncClient):
    resp = await client_csrf.post("/api/search/validate", json={"query": ""})
    assert resp.status_code == 422  # Pydantic min_length=1


@pytest.mark.asyncio
async def test_validate_oversize_query_returns_422(client_csrf: AsyncClient):
    resp = await client_csrf.post(
        "/api/search/validate",
        json={"query": "C" * 501},
    )
    assert resp.status_code == 422  # Pydantic max_length=500


@pytest.mark.asyncio
async def test_validate_stereo_flag_accepted(client_csrf: AsyncClient):
    resp = await client_csrf.post(
        "/api/search/validate",
        json={"query": "C[C@H](O)N", "stereo": True},
    )
    assert resp.status_code == 200
    assert resp.json()["valid"] is True
