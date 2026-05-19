"""SRCH-02: molecular formula match (Plan 09-03 wave 3)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.services.db import AsyncSessionLocal


@pytest.mark.asyncio
async def test_formula_match(client_csrf: AsyncClient) -> None:
    """Querying formula='C6H6' returns benzene-indexed rows (SRCH-02)."""
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(
                "INSERT INTO substances (inchi_key, smiles, inchi, "
                "extended_smiles, molecular_formula, svg, svg_cdx, "
                "mdlv3000, canonical_smiles) VALUES "
                "(:k, 'c1ccccc1', '', '', 'C6H6', '', '', '', 'c1ccccc1') "
                "ON CONFLICT (inchi_key) DO NOTHING"
            ),
            {"k": "UHOVQNZJYSORNB-UHFFFAOYSA-N"},
        )
        await session.commit()

    resp = await client_csrf.post(
        "/api/search",
        json={"query": "C6H6", "type": "formula"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 1
    assert all(r["substance"]["molecular_formula"] == "C6H6" for r in body["results"])
