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
            "INSERT INTO substances (id, dedup_key, inchi_key, inchi, smiles, "
            "  extended_smiles, molecular_formula, svg, svg_cdx, mdlv3000, "
            "  first_seen_at) "
            "VALUES (9100, 'BBBBBBBBBBBBBB-BBBBBBBBBB-N', "
            "  'BBBBBBBBBBBBBB-BBBBBBBBBB-N', '', '', '', '', "
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
        "svg_cdx was empty and molblock was present — backfill should have rendered it"
    )

    # Second call reads the persisted value without re-rendering. Verify
    # the persisted value is the same (not regenerated).
    second = await client.get("/api/history/9100")
    assert second.json()["substances"][0]["svg_cdx"] == sub["svg_cdx"]

    # Direct DB read confirms the backfill was persisted.
    row = (
        await db_session.execute(text("SELECT svg_cdx FROM substances WHERE id = 9100"))
    ).one()
    assert row[0] == sub["svg_cdx"]


@pytest.mark.asyncio
async def test_history_detail_skips_backfill_when_already_populated(
    client, db_session, simple_v3000_block, monkeypatch
):
    """Once a row has svg + svg_cdx, the endpoint must NOT re-invoke the
    JVM parser on subsequent reads — proves the `if s.svg and s.svg_cdx:
    continue` short-circuit stays in place."""
    # Seed a row with BOTH fields already populated.
    await db_session.execute(
        text(
            "INSERT INTO extractions (id, filename, file_size, format, "
            "  structure_count, reaction_count, extraction_time_ms, warnings, "
            "  created_at) "
            "VALUES (9101, 'hot.cdx', 1, 'cdx', 1, 0, 1.0, '[]'::jsonb, NOW())"
        )
    )
    await db_session.execute(
        text(
            "INSERT INTO substances (id, dedup_key, inchi_key, inchi, smiles, "
            "  extended_smiles, molecular_formula, svg, svg_cdx, mdlv3000, "
            "  first_seen_at) "
            "VALUES (9101, 'CCCCCCCCCCCCCC-CCCCCCCCCC-N', "
            "  'CCCCCCCCCCCCCC-CCCCCCCCCC-N', '', '', '', '', "
            "  '<svg>cdk</svg>', '<svg>cdx</svg>', :mb, NOW())"
        ),
        {"mb": simple_v3000_block},
    )
    await db_session.execute(
        text(
            "INSERT INTO extraction_substances (extraction_id, substance_id, "
            "  position) VALUES (9101, 9101, 0)"
        )
    )
    await db_session.commit()

    # Spy on render_svgs_from_mdlv3000 — the endpoint imports it from the
    # router's own namespace, so patch THAT binding (not the source module).
    from app.routers import history as history_module

    call_count = 0
    original = history_module.render_svgs_from_mdlv3000

    async def spy(sub):
        nonlocal call_count
        call_count += 1
        return await original(sub)

    monkeypatch.setattr(history_module, "render_svgs_from_mdlv3000", spy)

    response = await client.get("/api/history/9101")
    assert response.status_code == 200
    assert call_count == 0, (
        f"render_svgs_from_mdlv3000 was called {call_count} times for a "
        f"fully-populated row — the short-circuit must skip the JVM entirely."
    )
