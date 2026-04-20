"""Regression: GET /api/history/{id} must include svg_cdx on each substance."""

import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_history_detail_returns_svg_cdx(client, db_session):
    # Insert an extraction + substance with a non-empty svg_cdx directly
    # through the DB so we don't depend on the full JPype pipeline.
    await db_session.execute(
        text(
            "INSERT INTO extractions "
            "(id, filename, file_size, format, structure_count, "
            " reaction_count, extraction_time_ms, warnings, created_at) "
            "VALUES (9001, 'cdx_fixture.cdx', 100, 'cdx', 1, 0, 10.0, "
            "'[]'::jsonb, NOW())"
        )
    )
    await db_session.execute(
        text(
            "INSERT INTO substances "
            "(id, inchi_key, inchi, smiles, extended_smiles, molecular_formula, "
            " svg, svg_cdx, mdlv3000, first_seen_at) "
            "VALUES (9001, 'AAAAAAAAAAAAAA-AAAAAAAAAA-N', 'InChI=1S/Cl/q-1', "
            "'[Cl-]', '', '[Cl]-', '<svg>cdk</svg>', '<svg>cdx</svg>', "
            "'MOLBLOCK', NOW())"
        )
    )
    await db_session.execute(
        text(
            "INSERT INTO extraction_substances "
            "(extraction_id, substance_id, position) VALUES (9001, 9001, 0)"
        )
    )
    await db_session.commit()

    response = await client.get("/api/history/9001")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["substances"]) == 1
    sub = payload["substances"][0]
    assert sub["svg"] == "<svg>cdk</svg>"
    assert sub["svg_cdx"] == "<svg>cdx</svg>", (
        "svg_cdx must not be silently dropped by _extraction_to_response"
    )
