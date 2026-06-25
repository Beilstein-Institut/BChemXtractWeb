"""SRCH-01: exact InChI-key match."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.services.db import AsyncSessionLocal
from tests.conftest import link_substances_to_extraction


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
    # Link to one of the caller's extractions so the RLS-scoped search join
    # can reach it (the substances table itself carries no RLS).
    await link_substances_to_extraction(["UHOVQNZJYSORNB-UHFFFAOYSA-N"])


@pytest.mark.asyncio
async def test_inchi_key_exact_match(client_csrf: AsyncClient) -> None:
    """Exact InChI key returns the matching substance (SRCH-01)."""
    await _seed_benzene()
    resp = await client_csrf.post(
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
async def test_inchi_key_normalization(client_csrf: AsyncClient) -> None:
    """Lowercase + whitespace input is normalized to upper-trimmed form."""
    await _seed_benzene()
    resp = await client_csrf.post(
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


_SURROGATE_KEY = "S274AC64682B2D-1DB993AA24-N"


async def _seed_surrogate() -> None:
    """Seed an InChI-less fragment substance with a surrogate ``S…`` key."""
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(
                "INSERT INTO substances "
                "(inchi_key, smiles, inchi, extended_smiles, molecular_formula, "
                " svg, svg_cdx, mdlv3000, canonical_smiles) VALUES "
                "(:k, 'C1CCCCC1', '', '', 'C6H12', '', '', '', 'C1CCCCC1') "
                "ON CONFLICT (inchi_key) DO NOTHING"
            ),
            {"k": _SURROGATE_KEY},
        )
        await session.commit()
    await link_substances_to_extraction([_SURROGATE_KEY])


@pytest.mark.asyncio
async def test_surrogate_inchi_key_resolves_for_share_links(
    client_csrf: AsyncClient,
) -> None:
    """A surrogate ``S…`` key (digits → fails the real-InChIKey regex) must
    still resolve by exact match, so a /browse#s=<surrogate> share link opens.
    """
    await _seed_surrogate()
    resp = await client_csrf.post(
        "/api/search",
        json={"query": _SURROGATE_KEY, "type": "inchi_key"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert any(r["substance"]["inchi_key"] == _SURROGATE_KEY for r in body["results"])


@pytest.mark.asyncio
async def test_garbage_inchi_key_still_rejected(client_csrf: AsyncClient) -> None:
    """A non-surrogate, non-InChIKey string is still a 422 (regex unchanged)."""
    resp = await client_csrf.post(
        "/api/search",
        json={"query": "123 not a key", "type": "inchi_key"},
    )
    assert resp.status_code == 422, resp.text
