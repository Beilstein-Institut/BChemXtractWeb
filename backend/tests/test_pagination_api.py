"""Integration tests for GET /api/extractions/{id}/substances (DISP-03).

Tests the paginated substances endpoint, extraction_id in POST /api/extract,
and various sort/page/size parameter combinations.

Run: conda run -n cheminformatics pytest tests/test_pagination_api.py -x -q
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_get_substances_page_returns_paged_response(
    client_csrf: AsyncClient, cdx_file_bytes: bytes
):
    """DISP-03: substances endpoint returns PagedSubstancesResponse shape."""
    # POST extraction to get a real extraction_id
    upload = await client_csrf.post(
        "/api/extract",
        files={"file": ("test.cdx", cdx_file_bytes, "application/octet-stream")},
    )
    assert upload.status_code == 200
    extraction_id = upload.json().get("extraction_id")
    assert extraction_id is not None and extraction_id > 0

    # GET paginated substances
    resp = await client_csrf.get(
        f"/api/extractions/{extraction_id}/substances?page=1&size=12&sort=extraction_order"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert "total" in body
    assert "page" in body
    assert "size" in body
    assert "pages" in body
    assert body["page"] == 1
    assert body["size"] == 12


async def test_get_substances_page_404_for_unknown_extraction(client_csrf: AsyncClient):
    """DISP-03: substances endpoint returns 404 for missing extraction."""
    resp = await client_csrf.get("/api/extractions/99999999/substances")
    assert resp.status_code == 404


async def test_get_substances_page_formula_sort(
    client_csrf: AsyncClient, cdx_file_bytes: bytes
):
    """DISP-03: sort=formula returns 200 with items list."""
    upload = await client_csrf.post(
        "/api/extract",
        files={"file": ("test.cdx", cdx_file_bytes, "application/octet-stream")},
    )
    assert upload.status_code == 200
    extraction_id = upload.json().get("extraction_id")
    assert extraction_id is not None

    resp = await client_csrf.get(
        f"/api/extractions/{extraction_id}/substances?sort=formula"
    )
    assert resp.status_code == 200
    assert "items" in resp.json()


async def test_get_substances_page_respects_size(
    client_csrf: AsyncClient, cdx_file_bytes: bytes
):
    """DISP-03: size=1 returns at most 1 item."""
    upload = await client_csrf.post(
        "/api/extract",
        files={"file": ("test.cdx", cdx_file_bytes, "application/octet-stream")},
    )
    assert upload.status_code == 200
    extraction_id = upload.json().get("extraction_id")
    assert extraction_id is not None

    resp = await client_csrf.get(
        f"/api/extractions/{extraction_id}/substances?page=1&size=1"
    )
    assert resp.status_code == 200
    assert len(resp.json()["items"]) <= 1


async def test_get_substances_page_out_of_range_returns_empty(
    client_csrf: AsyncClient, cdx_file_bytes: bytes
):
    """DISP-03: page=9999 (beyond last page) returns 200 with empty items list."""
    upload = await client_csrf.post(
        "/api/extract",
        files={"file": ("test.cdx", cdx_file_bytes, "application/octet-stream")},
    )
    assert upload.status_code == 200
    extraction_id = upload.json().get("extraction_id")
    assert extraction_id is not None

    resp = await client_csrf.get(
        f"/api/extractions/{extraction_id}/substances?page=9999"
    )
    assert resp.status_code == 200
    assert resp.json()["items"] == []


async def test_extraction_response_includes_id(
    client_csrf: AsyncClient, cdx_file_bytes: bytes
):
    """DISP-03: POST /api/extract response includes extraction_id (positive int)."""
    upload = await client_csrf.post(
        "/api/extract",
        files={"file": ("test.cdx", cdx_file_bytes, "application/octet-stream")},
    )
    assert upload.status_code == 200
    body = upload.json()
    assert "extraction_id" in body
    assert isinstance(body["extraction_id"], int)
    assert body["extraction_id"] > 0
