"""SRCH-03: SMILES match — canonical (default) + literal."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.services.db import AsyncSessionLocal
from tests.conftest import link_substances_to_extraction


@pytest.mark.asyncio
async def test_smiles_canonical_equivalence(client_csrf: AsyncClient) -> None:
    """`c1ccccc1` and `C1=CC=CC=C1` collide on the same canonical row (SRCH-03).

    Seed a row whose stored SMILES is the Kekulé form but whose
    ``canonical_smiles`` is the aromatic form. The extraction
    write-through path produces this shape for any real extraction.
    """
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(
                "INSERT INTO substances (dedup_key, inchi_key, smiles, inchi, "
                "extended_smiles, molecular_formula, svg, svg_cdx, "
                "mdlv3000, canonical_smiles) VALUES "
                "(:k, :k, 'C1=CC=CC=C1', '', '', 'C6H6', '', '', '', 'c1ccccc1') "
                "ON CONFLICT (dedup_key) DO NOTHING"
            ),
            {"k": "UHOVQNZJYSORNB-UHFFFAOYSA-N"},
        )
        await session.commit()
    await link_substances_to_extraction(["UHOVQNZJYSORNB-UHFFFAOYSA-N"])

    resp = await client_csrf.post(
        "/api/search",
        json={
            "query": "c1ccccc1",
            "type": "smiles",
            "match": "canonical",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_smiles_literal_match(client_csrf: AsyncClient) -> None:
    """match=literal bypasses canonicalization (exact smiles column match)."""
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(
                "INSERT INTO substances (dedup_key, inchi_key, smiles, inchi, "
                "extended_smiles, molecular_formula, svg, svg_cdx, "
                "mdlv3000, canonical_smiles) VALUES "
                "(:k, :k, 'LITERAL_UNIQUE_SMILES_STRING', '', '', 'X', "
                "'', '', '', NULL) "
                "ON CONFLICT (dedup_key) DO NOTHING"
            ),
            {"k": "LITERALSMILESB-UHFFFAOYSA-N"},
        )
        await session.commit()
    await link_substances_to_extraction(["LITERALSMILESB-UHFFFAOYSA-N"])

    resp = await client_csrf.post(
        "/api/search",
        json={
            "query": "LITERAL_UNIQUE_SMILES_STRING",
            "type": "smiles",
            "match": "literal",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] >= 1
