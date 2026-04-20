"""GET /api/history/{id} backfills missing svg / svg_cdx via stored molblock."""

import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_history_detail_backfills_missing_svg_cdx(
    client, db_session, simple_v3000_block
):
    # Seed: svg populated, svg_cdx empty, molblock present
    await db_session.execute(
        text(
            "INSERT INTO extractions (id, filename, file_size, format, "
            "  structure_count, reaction_count, extraction_time_ms, warnings, "
            "  created_at) "
            "VALUES (9100, 'old.cdx', 1, 'cdx', 1, 0, 1.0, '[]'::jsonb, NOW())"
        )
    )
    # inchi / smiles / extended_smiles / molecular_formula are NOT NULL in
    # the substances schema — use empty strings (the ORM default) so the
    # INSERT matches schema constraints while keeping the fixture minimal.
    await db_session.execute(
        text(
            "INSERT INTO substances (id, inchi_key, inchi, smiles, "
            "  extended_smiles, molecular_formula, svg, svg_cdx, mdlv3000, "
            "  first_seen_at) "
            "VALUES (9100, 'BBBBBBBBBBBBBB-BBBBBBBBBB-N', '', '', '', '', "
            "  '<svg>existing-cdk</svg>', '', :molblock, NOW())"
        ),
        {"molblock": simple_v3000_block},
    )
    await db_session.execute(
        text(
            "INSERT INTO extraction_substances (extraction_id, substance_id, "
            "  position) VALUES (9100, 9100, 0)"
        )
    )
    await db_session.commit()

    response = await client.get("/api/history/9100")
    assert response.status_code == 200
    sub = response.json()["substances"][0]

    # svg untouched (was populated)
    assert sub["svg"] == "<svg>existing-cdk</svg>"
    # svg_cdx was empty — must be filled by backfill
    assert sub["svg_cdx"], (
        "svg_cdx was empty and molblock was present — backfill should "
        "have rendered it"
    )

    # Second call reads the persisted value without re-rendering. Verify
    # the persisted value is the same (not regenerated).
    second = await client.get("/api/history/9100")
    assert second.json()["substances"][0]["svg_cdx"] == sub["svg_cdx"]

    # Direct DB read confirms the backfill was persisted.
    row = (
        await db_session.execute(
            text("SELECT svg_cdx FROM substances WHERE id = 9100")
        )
    ).one()
    assert row[0] == sub["svg_cdx"]
