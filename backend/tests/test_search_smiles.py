"""SRCH-03: SMILES match — canonical (default) + literal (stubs)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.skip(
    reason="Wave 3 — search router + canonical column not yet implemented"
)
@pytest.mark.asyncio
async def test_smiles_canonical_equivalence(client: AsyncClient) -> None:
    """`c1ccccc1` and `C1=CC=CC=C1` match the same benzene row."""
    ...


@pytest.mark.skip(reason="Wave 3 — search router not yet implemented")
@pytest.mark.asyncio
async def test_smiles_literal_match(client: AsyncClient) -> None:
    """match=literal bypasses canonicalization."""
    ...
