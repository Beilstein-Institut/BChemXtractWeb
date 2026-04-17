"""SRCH-04: SMARTS substructure match via CDK (stubs — Wave 3)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.skip(reason="Wave 3 — CDK SMARTS matcher not yet implemented")
@pytest.mark.asyncio
async def test_substructure_benzene_in_naphthalene(client: AsyncClient) -> None:
    """SMARTS `c1ccccc1` matches naphthalene (fused aromatic ring)."""
    ...


@pytest.mark.skip(reason="Wave 3 — search router not yet implemented")
@pytest.mark.asyncio
async def test_substructure_invalid_smarts(client: AsyncClient) -> None:
    """Invalid SMARTS returns 422 with code=INVALID_SMARTS."""
    ...


@pytest.mark.skip(reason="Wave 3 — depiction highlight not yet implemented")
@pytest.mark.asyncio
async def test_substructure_match_svg_highlight(client: AsyncClient) -> None:
    """Substructure hit response includes match_svg with blue highlight."""
    ...


@pytest.mark.skip(reason="Wave 3 — D-09 skip-and-warn not yet implemented")
@pytest.mark.asyncio
async def test_substructure_unparsable_skipped_with_warning(
    client: AsyncClient,
) -> None:
    """Unparsable stored SMILES is skipped and counted in warnings."""
    ...


@pytest.mark.skip(reason="Wave 3 — attribution aggregation not yet implemented")
@pytest.mark.asyncio
async def test_attribution_aggregation(client: AsyncClient) -> None:
    """Response includes extraction_count and extractions list per hit."""
    ...
