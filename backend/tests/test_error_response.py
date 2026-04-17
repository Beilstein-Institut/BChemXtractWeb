"""D-17 unified ErrorResponse shape across all routers (Wave 4)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.skip(reason="Wave 4 — unified ErrorResponse handler not yet wired")
@pytest.mark.asyncio
async def test_http_exception_emits_detail_and_code(
    client_no_jvm: AsyncClient,
) -> None:
    """Any 404/400 from any router emits {detail, code} (not {error})."""
    ...


@pytest.mark.skip(reason="Wave 4 — validation handler not yet wired")
@pytest.mark.asyncio
async def test_validation_error_shape(client_no_jvm: AsyncClient) -> None:
    """Bad request body produces code=VALIDATION_ERROR + populated fields."""
    ...


@pytest.mark.skip(reason="Wave 4 — bridge handler not yet wired")
@pytest.mark.asyncio
async def test_bridge_error_emits_stable_code(client: AsyncClient) -> None:
    """ExtractionError → 422 + code=EXTRACTION_FAILED."""
    ...
