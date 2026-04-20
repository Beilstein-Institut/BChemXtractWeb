"""After fast-path extraction, every substance dict has both svg + svg_cdx populated."""

import pytest

from app.services.extractor import extract_substances_with_svg


@pytest.mark.asyncio
async def test_fast_path_populates_both_svg_fields(started_app, cdx_file_bytes):
    """L-lactic-acid.cdx is small enough for the xtractUnique fast path, so
    we exercise the primary extraction path (not the fragment fallback).

    After extraction, every substance must carry both SVG layouts:
      - ``svg``     — fresh CDK 2D layout
      - ``svg_cdx`` — ChemDraw original coordinates

    No cross-fallback: the two renders are independent.
    """
    substances, _info, _warnings = await extract_substances_with_svg(
        cdx_file_bytes, "cdx"
    )
    assert len(substances) >= 1
    for sub in substances:
        assert sub.svg, f"svg (CDK layout) missing for {sub.molecular_formula}"
        assert sub.svg_cdx, (
            f"svg_cdx (ChemDraw coords) missing for {sub.molecular_formula}"
        )
        assert sub.svg != sub.svg_cdx, (
            "The two layouts should differ — found identical SVG strings, "
            "suggesting the fast path is reusing the same render"
        )
