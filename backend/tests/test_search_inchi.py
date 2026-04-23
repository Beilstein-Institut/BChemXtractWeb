"""SRCH-01: exact InChI-key match (Plan 09-03 wave 3)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.services.db import AsyncSessionLocal


async def _seed_benzene() -> None:
    """Seed the canonical-benzene fixture row on the app's DB.

    We use the app's ``AsyncSessionLocal`` directly (not the ``db_session``
    fixture) so the seed lands on the same database the ``client`` fixture
    hits via its lifespan-wired engine.
    """
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(
                "INSERT INTO substances "
                "(inchi_key, smiles, inchi, extended_smiles, molecular_formula, "
                " svg, svg_cdx, mdlv3000, canonical_smiles) VALUES "
                "(:k, 'c1ccccc1', '', '', 'C6H6', '', '', '', 'c1ccccc1') "
                "ON CONFLICT (inchi_key) DO NOTHING"
            ),
            {"k": "UHOVQNZJYSORNB-UHFFFAOYSA-N"},
        )
        await session.commit()


@pytest.mark.asyncio
async def test_inchi_key_exact_match(client: AsyncClient) -> None:
    """Exact InChI key returns the matching substance (SRCH-01)."""
    await _seed_benzene()
    resp = await client.post(
        "/api/search",
        json={
            "query": "UHOVQNZJYSORNB-UHFFFAOYSA-N",
            "type": "inchi_key",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 1
    assert any(
        r["substance"]["inchi_key"] == "UHOVQNZJYSORNB-UHFFFAOYSA-N"
        for r in body["results"]
    )


@pytest.mark.asyncio
async def test_inchi_key_normalization(client: AsyncClient) -> None:
    """Lowercase + whitespace input is normalized to upper-trimmed form."""
    await _seed_benzene()
    resp = await client.post(
        "/api/search",
        json={
            "query": "  uhovqnzjysornb-uhfffaoysa-n  ",
            "type": "inchi_key",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 1
    assert any(
        r["substance"]["inchi_key"] == "UHOVQNZJYSORNB-UHFFFAOYSA-N"
        for r in body["results"]
    )
