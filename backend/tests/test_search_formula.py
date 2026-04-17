"""SRCH-02: molecular formula match (stubs — Wave 3 implementation)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.skip(reason="Wave 3 — search router not yet implemented")
@pytest.mark.asyncio
async def test_formula_match(client: AsyncClient) -> None:
    """Posting `C6H6` returns benzene-matching substances."""
    ...
