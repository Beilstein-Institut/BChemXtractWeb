"""Tests for app.services.cdx_render — faithful CDX/CDXML -> SVG via cdx-render jar."""

import re

import pytest

from app.services.cdx_render import render_cdx_svg


@pytest.mark.asyncio
async def test_render_cdx_svg_returns_svg(started_app, cdx_file_bytes: bytes):
    svg = await render_cdx_svg(cdx_file_bytes)
    assert "<svg" in svg
    assert len(svg) > 200


@pytest.mark.asyncio
async def test_render_svg_carries_transform_attrs(started_app, cdx_file_bytes: bytes):
    svg = await render_cdx_svg(cdx_file_bytes)
    assert 'data-cdx-scale="' in svg
    assert 'data-cdx-origin-x="' in svg
    assert 'data-cdx-origin-y="' in svg
    # The frontend's CDX->SVG transform parser requires an integer, zero-origin
    # viewBox (/viewBox="0 0 (\d+) (\d+)"/); if the Java writer ever emitted
    # decimal dims this test catches it instead of the frontend silently
    # rendering no highlight overlay.
    assert re.search(r'viewBox="0 0 \d+ \d+"', svg), (
        "render viewBox must be integer/zero-origin for the frontend parser"
    )
