"""API-01/API-02: OpenAPI curation + Redoc smoke tests."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

APPROVED_OPERATION_IDS = {
    # extraction
    "extractFile",
    "getExtractionSubstances",
    # extraction (experimental reactions)
    "extractReactions",
    "getExtractionReactions",
    # history
    "listHistory",
    "getHistoryDetail",
    "deleteHistoryEntry",
    "getStats",
    # batch
    "startBatch",
    "streamBatchProgress",
    "cancelBatch",
    "getBatchExtractions",
    "downloadBatchZip",
    # export
    "exportSubstances",
    # health
    "healthCheck",
    "healthDetail",
    # search
    "searchSubstances",
    # search (parse-only validate endpoint)
    "validateSearchQuery",
    # on-demand InChI compute
    "computeInchi",
    # auth / CSRF / GDPR / admin api keys
    "putAuthMe",
    "postAuthRestore",
    "getCsrfToken",
    "deleteMyData",
    "adminCreateApiKey",
    "adminListApiKeys",
    "adminRevokeApiKey",
    # pubchem enrichment (opt-in)
    "enrichPubChem",
    "getPubChemCompound",
    "getPubChemStatus",
}


@pytest.mark.asyncio
async def test_swagger_docs_served(client_no_jvm: AsyncClient) -> None:
    """GET /docs returns 200 and Swagger UI markup (API-01 — no regression)."""
    resp = await client_no_jvm.get("/docs")
    assert resp.status_code == 200
    assert "swagger" in resp.text.lower()


@pytest.mark.asyncio
async def test_redoc_served(client_no_jvm: AsyncClient) -> None:
    """GET /redoc returns 200 and Redoc markup (API-01)."""
    resp = await client_no_jvm.get("/redoc")
    assert resp.status_code == 200
    assert "redoc" in resp.text.lower()


@pytest.mark.asyncio
async def test_every_route_has_operation_id_and_tags(
    client_no_jvm: AsyncClient,
) -> None:
    """API-02: every /api route has operationId + non-empty tags."""
    resp = await client_no_jvm.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    for path, methods in schema["paths"].items():
        for method, spec in methods.items():
            if method not in ("get", "post", "put", "delete", "patch"):
                continue
            assert spec.get("operationId"), (
                f"{method.upper()} {path} missing operationId"
            )
            assert spec.get("tags"), f"{method.upper()} {path} missing tags"


@pytest.mark.asyncio
async def test_operation_id_snapshot(client_no_jvm: AsyncClient) -> None:
    """API-02: operation_ids match the approved minted set exactly (no drift)."""
    resp = await client_no_jvm.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    observed = set()
    for _path, methods in schema["paths"].items():
        for method, spec in methods.items():
            if method not in ("get", "post", "put", "delete", "patch"):
                continue
            op_id = spec.get("operationId")
            if op_id:
                observed.add(op_id)
    # Must contain every approved id — no missing ones
    missing = APPROVED_OPERATION_IDS - observed
    assert not missing, f"approved operation_ids missing from schema: {missing}"
    # No unapproved ids introduced
    extra = observed - APPROVED_OPERATION_IDS
    assert not extra, f"unapproved operation_ids in schema: {extra}"


@pytest.mark.asyncio
async def test_tags_metadata_present(client_no_jvm: AsyncClient) -> None:
    """API-02: openapi_tags top-level has descriptions for all six tag groups."""
    resp = await client_no_jvm.get("/openapi.json")
    schema = resp.json()
    tag_names = {t["name"] for t in schema.get("tags", [])}
    assert {"extraction", "history", "search", "batch", "export", "health"} <= tag_names
