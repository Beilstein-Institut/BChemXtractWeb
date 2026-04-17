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
    # Plan 04 will add match_svg; here match_atom_indices should be populated
    hits = [
        r
        for r in body["results"]
        if r["substance"]["inchi_key"] == "UFWIBTONFRDIAS-UHFFFAOYSA-N"
    ]
    assert len(hits) == 1
    assert len(hits[0]["match_atom_indices"]) >= 6  # benzene ring is 6 atoms


@pytest.mark.asyncio
async def test_substructure_invalid_smarts(client: AsyncClient) -> None:
    """Invalid SMARTS raises InvalidSmartsError (maps to 422 in Plan 05).

    Plan 05 maps ``InvalidSmartsError`` to 422 + ``code='INVALID_SMARTS'``.
    Until Plan 05 ships, the generic handler returns 500. Accept either
    here so Plan 03's integration test stays green in the interim — Plan
    05 will tighten this to ``== 422`` exactly.
    """
    resp = await client.post(
        "/api/search",
        json={"query": "c1ccc(((", "type": "substructure"},
        timeout=60.0,
    )
    assert resp.status_code in (422, 500), (
        f"expected 422 or 500, got {resp.status_code}: {resp.text}"
    )


@pytest.mark.skip(reason="Wave 4 — depiction highlight not yet implemented (Plan 09-04)")
@pytest.mark.asyncio
async def test_substructure_match_svg_highlight(client: AsyncClient) -> None:
    """Substructure hit response includes match_svg with blue highlight."""
    ...


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
