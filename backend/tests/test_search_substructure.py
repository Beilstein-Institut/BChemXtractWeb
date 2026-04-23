"""SRCH-04: SMARTS substructure match via CDK (Plan 09-03 wave 3).

Plan 04 (highlight depiction) flips the match_svg highlight stub;
this file flips the other four: benzene-in-naphthalene, invalid
SMARTS, skip-and-warn on unparsable stored SMILES (D-09), and
attribution aggregation (D-10).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.services.db import AsyncSessionLocal


@pytest.mark.asyncio
async def test_substructure_benzene_in_naphthalene(client: AsyncClient) -> None:
    """SMARTS `c1ccccc1` matches naphthalene (fused aromatic ring)."""
    # Naphthalene SMILES `c1ccc2ccccc2c1` contains the benzene ring pattern.
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(
                "INSERT INTO substances (inchi_key, smiles, inchi, "
                "extended_smiles, molecular_formula, svg, svg_cdx, "
                "mdlv3000, canonical_smiles) VALUES "
                "(:k, 'c1ccc2ccccc2c1', '', '', 'C10H8', '', '', '', "
                "'c1ccc2ccccc2c1') "
                "ON CONFLICT (inchi_key) DO NOTHING"
            ),
            {"k": "UFWIBTONFRDIAS-UHFFFAOYSA-N"},
        )
        await session.commit()

    resp = await client.post(
        "/api/search",
        json={"query": "c1ccccc1", "type": "substructure"},
        timeout=60.0,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 1
    hits = [
        r
        for r in body["results"]
        if r["substance"]["inchi_key"] == "UFWIBTONFRDIAS-UHFFFAOYSA-N"
    ]
    assert len(hits) == 1
    assert len(hits[0]["match_atom_indices"]) >= 6  # benzene ring is 6 atoms
    # Plan 04: match_svg is now populated for every substructure hit.
    assert hits[0]["match_svg"] is not None, (
        "Plan 04 must populate match_svg on substructure hits"
    )


@pytest.mark.asyncio
async def test_substructure_invalid_smarts(client: AsyncClient) -> None:
    """Invalid SMARTS raises InvalidSmartsError → 422 + code=INVALID_SMARTS.

    Plan 05 shipped the unified ErrorResponse handler — InvalidSmartsError
    now strictly maps to 422 + code=INVALID_SMARTS. No (422, 500) tolerance.
    """
    resp = await client.post(
        "/api/search",
        json={"query": "c1ccc(((", "type": "substructure"},
        timeout=60.0,
    )
    assert resp.status_code == 422, f"expected 422, got {resp.status_code}: {resp.text}"
    assert resp.json().get("code") == "INVALID_SMARTS", (
        f"expected code=INVALID_SMARTS, got body={resp.text}"
    )


@pytest.mark.asyncio
async def test_substructure_match_svg_highlight(client: AsyncClient) -> None:
    """Substructure hit response includes match_svg with Apple Blue highlight.

    Plan 04: D-13 + UI-SPEC §Color. Every substructure hit carries a
    :func:`render_substance_svg_with_highlight`-rendered SVG that contains:
      - the Apple Blue color (#0071e3 or rgba(0,113,227,…)) per UI-SPEC §Color
      - a ``<title>Matches …</title>`` accessibility tag per UI-SPEC §Accessibility
    """
    # Seed naphthalene (needs a hit to produce match_svg)
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(
                "INSERT INTO substances (inchi_key, smiles, inchi, "
                "extended_smiles, molecular_formula, svg, svg_cdx, "
                "mdlv3000, canonical_smiles) VALUES "
                "(:k, 'c1ccc2ccccc2c1', '', '', 'C10H8', '', '', '', "
                "'c1ccc2ccccc2c1') "
                "ON CONFLICT (inchi_key) DO NOTHING"
            ),
            {"k": "UFWIBTONFRDIAS-UHFFFAOYSA-N"},
        )
        await session.commit()

    resp = await client.post(
        "/api/search",
        json={"query": "c1ccccc1", "type": "substructure"},
        timeout=60.0,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    hit = next(
        (
            r
            for r in body["results"]
            if r["substance"]["inchi_key"] == "UFWIBTONFRDIAS-UHFFFAOYSA-N"
        ),
        None,
    )
    assert hit is not None, "expected naphthalene in hits"
    svg = hit["match_svg"]
    assert svg, "match_svg must be populated for substructure hits"
    # UI-SPEC §Color: Apple Blue appears either as the #0071e3 hex
    # literal or as an rgba()/rgb() fragment (with or without spaces).
    svg_lower = svg.lower()
    svg_compact = svg.replace(" ", "").lower()
    assert (
        "0071e3" in svg_lower
        or "rgba(0,113,227" in svg_compact
        or "rgb(0,113,227" in svg_compact
    ), "match_svg must contain Apple Blue highlight color per UI-SPEC §Color"
    # Accessibility contract: the helper injects <title>Matches …</title>
    assert "<title>Matches " in svg, (
        "match_svg must embed <title>Matches …</title> per UI-SPEC §Accessibility"
    )


@pytest.mark.asyncio
async def test_substructure_unparsable_skipped_with_warning(
    client: AsyncClient,
) -> None:
    """Unparsable stored SMILES is skipped and counted in warnings (D-09)."""
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(
                "INSERT INTO substances (inchi_key, smiles, inchi, "
                "extended_smiles, molecular_formula, svg, svg_cdx, "
                "mdlv3000, canonical_smiles) VALUES "
                "(:k, 'totally-not-a-smiles-xyz', '', '', 'X', '', '', '', NULL) "
                "ON CONFLICT (inchi_key) DO NOTHING"
            ),
            {"k": "BADSMILESSTUB1-UHFFFAOYSA-N"},
        )
        await session.commit()

    resp = await client.post(
        "/api/search",
        json={"query": "c1ccccc1", "type": "substructure"},
        timeout=60.0,
    )
    assert resp.status_code == 200, resp.text
    # Warning present iff at least one unparsable row exists.
    warnings = resp.json()["warnings"]
    assert any("could not be parsed" in w for w in warnings), warnings


@pytest.mark.asyncio
async def test_attribution_aggregation(client: AsyncClient) -> None:
    """Hit response carries extraction_count + populated extractions list (D-10)."""
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(
                "INSERT INTO extractions (filename, file_size, format, "
                "structure_count, extraction_time_ms, warnings) VALUES "
                "('test-attribution.cdx', 100, 'cdx', 1, 10.0, '[]'::jsonb) "
                "RETURNING id"
            )
        )
        ext_id = (
            await session.execute(
                text(
                    "SELECT id FROM extractions "
                    "WHERE filename = 'test-attribution.cdx' "
                    "ORDER BY id DESC LIMIT 1"
                )
            )
        ).scalar_one()
        await session.execute(
            text(
                "INSERT INTO substances (inchi_key, smiles, inchi, "
                "extended_smiles, molecular_formula, svg, svg_cdx, "
                "mdlv3000, canonical_smiles) VALUES "
                "(:k, '', '', '', 'C999', '', '', '', NULL) "
                "ON CONFLICT (inchi_key) DO NOTHING"
            ),
            {"k": "ATTRIBKEYZZAAA-UHFFFAOYSA-N"},
        )
        sub_id = (
            await session.execute(
                text(
                    "SELECT id FROM substances "
                    "WHERE inchi_key = 'ATTRIBKEYZZAAA-UHFFFAOYSA-N'"
                )
            )
        ).scalar_one()
        await session.execute(
            text(
                "INSERT INTO extraction_substances (extraction_id, "
                "substance_id, position) VALUES (:e, :s, 0) "
                "ON CONFLICT (extraction_id, substance_id) DO NOTHING"
            ),
            {"e": ext_id, "s": sub_id},
        )
        await session.commit()

    resp = await client.post(
        "/api/search",
        json={"query": "C999", "type": "formula"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    hits = [r for r in body["results"] if r["substance"]["id"] == sub_id]
    assert len(hits) == 1
    assert hits[0]["extraction_count"] >= 1
    assert any(e["extraction_id"] == ext_id for e in hits[0]["extractions"])
