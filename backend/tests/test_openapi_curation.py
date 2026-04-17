"""API-01/API-02: OpenAPI curation + Redoc smoke tests (Wave 4)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.skip(reason="Wave 4 — Redoc endpoint not yet wired")
@pytest.mark.asyncio
async def test_redoc_served(client_no_jvm: AsyncClient) -> None:
    """GET /redoc returns 200 and HTML content."""
    ...


@pytest.mark.skip(reason="Wave 4 — OpenAPI curation not yet applied")
@pytest.mark.asyncio
async def test_swagger_docs_served(client_no_jvm: AsyncClient) -> None:
    """GET /docs returns 200 and Swagger HTML."""
    ...


@pytest.mark.skip(reason="Wave 4 — OpenAPI curation not yet applied")
@pytest.mark.asyncio
async def test_every_route_has_operation_id_and_tags(
    client_no_jvm: AsyncClient,
) -> None:
    """All paths in openapi.json carry operationId + tags."""
    ...


@pytest.mark.skip(reason="Wave 4 — OpenAPI curation not yet applied")
@pytest.mark.asyncio
async def test_operation_id_snapshot(client_no_jvm: AsyncClient) -> None:
    """operation_ids match the approved minted-set from RESEARCH.md."""
    ...
