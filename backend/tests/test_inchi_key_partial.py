"""Partial InChI-key search — 14-char and 14-10-char prefixes (like PubChem).

A full InChI key is ``<14>-<10>-<1>``:
  * block 1 = skeletal connectivity
  * block 2 = stereochemistry / isotopes / reconnected-metals
  * block 3 = protonation state

PubChem lets users search by just the first block (all stereo variants of
the same skeleton) or the first two blocks (same skeleton + stereo,
different protonation). We mirror that behaviour.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.services.db import AsyncSessionLocal
from app.services.search import detect_search_type

# Three rows sharing block 1 "JVTAAEKCZFNVCJ"; rows 1+3 also share block 2.
_FULL_1 = "JVTAAEKCZFNVCJ-REOHCLBHSA-N"
_FULL_2 = "JVTAAEKCZFNVCJ-UHFFFAOYSA-N"
_FULL_3 = "JVTAAEKCZFNVCJ-REOHCLBHSA-O"


async def _seed_partial_corpus() -> None:
    async with AsyncSessionLocal() as session:
        for key in (_FULL_1, _FULL_2, _FULL_3):
            await session.execute(
                text(
                    "INSERT INTO substances "
                    "(inchi_key, smiles, inchi, extended_smiles, "
                    " molecular_formula, svg, svg_cdx, mdlv3000, "
                    " canonical_smiles) VALUES "
                    "(:k, '', '', '', '', '', '', '', '') "
                    "ON CONFLICT (inchi_key) DO NOTHING"
                ),
                {"k": key},
            )
        await session.commit()


def test_detect_partial_inchi_key_block1() -> None:
    """14 uppercase letters alone should classify as inchi_key."""
    assert detect_search_type("JVTAAEKCZFNVCJ") == "inchi_key"


def test_detect_partial_inchi_key_block1_and_2() -> None:
    """14-10 shape should also classify as inchi_key."""
    assert detect_search_type("JVTAAEKCZFNVCJ-REOHCLBHSA") == "inchi_key"


def test_detect_full_inchi_key_still_works() -> None:
    """Full 14-10-1 shape stays inchi_key (regression guard)."""
    assert detect_search_type(_FULL_1) == "inchi_key"


def test_trailing_dash_is_not_a_valid_inchi_key() -> None:
    """Incomplete block trailing a dash is not a valid partial key."""
    # Falls through to SMILES (or formula) — crucial: NOT inchi_key.
    assert detect_search_type("JVTAAEKCZFNVCJ-") != "inchi_key"


@pytest.mark.asyncio
async def test_partial_block1_returns_all_stereo_variants(
    client: AsyncClient,
) -> None:
    """14-char prefix returns every stored key sharing that skeleton."""
    await _seed_partial_corpus()
    resp = await client.post(
        "/api/search",
        json={"query": "JVTAAEKCZFNVCJ", "type": "inchi_key"},
    )
    assert resp.status_code == 200, resp.text
    keys = {r["substance"]["inchi_key"] for r in resp.json()["results"]}
    assert {_FULL_1, _FULL_2, _FULL_3} <= keys


@pytest.mark.asyncio
async def test_partial_block1_and_2_returns_protonation_variants(
    client: AsyncClient,
) -> None:
    """14-10 prefix returns keys sharing skeleton + stereo, any protonation."""
    await _seed_partial_corpus()
    resp = await client.post(
        "/api/search",
        json={"query": "JVTAAEKCZFNVCJ-REOHCLBHSA", "type": "inchi_key"},
    )
    assert resp.status_code == 200, resp.text
    keys = {r["substance"]["inchi_key"] for r in resp.json()["results"]}
    assert _FULL_1 in keys
    assert _FULL_3 in keys
    # Row 2 has a different block 2 — must NOT be in the results.
    assert _FULL_2 not in keys


@pytest.mark.asyncio
async def test_full_key_returns_only_exact_match(
    client: AsyncClient,
) -> None:
    """Full key is an exact match, not a prefix match."""
    await _seed_partial_corpus()
    resp = await client.post(
        "/api/search",
        json={"query": _FULL_1, "type": "inchi_key"},
    )
    assert resp.status_code == 200, resp.text
    keys = {r["substance"]["inchi_key"] for r in resp.json()["results"]}
    assert keys == {_FULL_1}


@pytest.mark.asyncio
async def test_trailing_dash_rejected_as_invalid(
    client: AsyncClient,
) -> None:
    """Partial key ending in a dash is malformed — 422."""
    resp = await client.post(
        "/api/search",
        json={"query": "JVTAAEKCZFNVCJ-", "type": "inchi_key"},
    )
    assert resp.status_code == 422
