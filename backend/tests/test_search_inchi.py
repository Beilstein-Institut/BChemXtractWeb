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
                "(dedup_key, inchi_key, smiles, inchi, extended_smiles, "
                " molecular_formula, svg, svg_cdx, mdlv3000, canonical_smiles) "
                "VALUES (:k, :k, 'c1ccccc1', '', '', 'C6H6', '', '', '', "
                "'c1ccccc1') ON CONFLICT (dedup_key) DO NOTHING"
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


# An old-style surrogate dedup value (contains hex digits). InChI-less
# substances no longer expose a key like this — it must be rejected as an
# InChIKey query, not special-cased.
_SURROGATE_SHAPED = "S274AC64682B2D-1DB993AA24-N"


@pytest.mark.asyncio
async def test_surrogate_shaped_key_now_rejected(client_csrf: AsyncClient) -> None:
    """A surrogate-shaped string (digits → fails the real-InChIKey regex) is now
    a 422: surrogate keys were dropped from the API, so this is no longer a
    valid InChIKey query (InChI-less structures are reached by SMILES)."""
    resp = await client_csrf.post(
        "/api/search",
        json={"query": _SURROGATE_SHAPED, "type": "inchi_key"},
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_garbage_inchi_key_still_rejected(client_csrf: AsyncClient) -> None:
    """A non-InChIKey string is still a 422 (regex unchanged)."""
    resp = await client_csrf.post(
        "/api/search",
        json={"query": "123 not a key", "type": "inchi_key"},
    )
    assert resp.status_code == 422, resp.text
