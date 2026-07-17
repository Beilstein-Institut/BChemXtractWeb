"""Tests for app.services.cdx_render — faithful CDX/CDXML -> SVG via cdx-render jar."""

from pathlib import Path

import pytest

from app.services.cdx_render import render_cdx_svg

FIXTURE_PATH = Path(__file__).resolve().parent.parent / "test_fixture.cdx"


@pytest.mark.asyncio
async def test_render_cdx_svg_returns_svg(started_app):
    data = FIXTURE_PATH.read_bytes()
    svg = await render_cdx_svg(data)
    assert "<svg" in svg
    assert len(svg) > 200
