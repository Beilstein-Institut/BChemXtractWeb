"""SRCH-01: exact InChI-key match (stubs — Wave 3 implementation)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.skip(reason="Wave 3 — search router not yet implemented")
@pytest.mark.asyncio
async def test_inchi_key_exact_match(client: AsyncClient) -> None:
    """Posting an exact InChI key returns the matching substance."""
    ...


@pytest.mark.skip(reason="Wave 3 — search router not yet implemented")
@pytest.mark.asyncio
async def test_inchi_key_normalization(client: AsyncClient) -> None:
    """Whitespace + lowercase input is normalized to upper-trimmed form."""
    ...
