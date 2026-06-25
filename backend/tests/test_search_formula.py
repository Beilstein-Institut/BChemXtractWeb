"""SRCH-02: molecular formula match."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.services.db import AsyncSessionLocal
from tests.conftest import link_substances_to_extraction


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
    # Substances are only reachable by search once linked to one of the
    # caller's extractions (RLS scopes the join, not the substances table).
    await link_substances_to_extraction(["UHOVQNZJYSORNB-UHFFFAOYSA-N"])

    resp = await client_csrf.post(
        "/api/search",
        json={"query": "C6H6", "type": "formula"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 1
    assert all(r["substance"]["molecular_formula"] == "C6H6" for r in body["results"])
