"""Unified ErrorResponse shape across all routers."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_http_exception_emits_detail_and_code(
    client_csrf: AsyncClient,
) -> None:
    """Any 404 from any router emits {detail, code}."""
    resp = await client_csrf.get("/api/history/9999999999")
    assert resp.status_code == 404
    body = resp.json()
    assert "detail" in body
    assert body.get("code") == "NOT_FOUND"
    assert "error" not in body  # old shape removed


@pytest.mark.asyncio
async def test_validation_error_shape(
    client_no_jvm_csrf: AsyncClient,
) -> None:
    """Pydantic validation failure emits code=VALIDATION_ERROR + fields."""
    resp = await client_no_jvm_csrf.post(
        "/api/search",
        json={"query": ""},  # min_length=1 violated
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body.get("code") == "VALIDATION_ERROR"
    assert isinstance(body.get("fields"), dict)
    assert any("query" in k for k in body["fields"])


@pytest.mark.asyncio
async def test_bad_request_shape(client_no_jvm_csrf: AsyncClient) -> None:
    """Export endpoint 400 path emits code=BAD_REQUEST."""
    resp = await client_no_jvm_csrf.post(
        "/api/export",
        json={"format": "sdf"},  # no substance_ids or extraction_id
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body.get("code") == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_invalid_smarts_shape(client_csrf: AsyncClient) -> None:
    """InvalidQueryError (dual-path parse) maps to 422 + code=INVALID_QUERY.

    The substructure service accepts SMILES or SMARTS — malformed input
    that both parsers reject raises :class:`InvalidQueryError`
    (code=INVALID_QUERY), replacing the former SMARTS-only error code.
    """
    resp = await client_csrf.post(
        "/api/search",
        json={"query": "c1ccc(((", "type": "substructure"},
        timeout=30.0,
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body.get("code") == "INVALID_QUERY"
