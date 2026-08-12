"""Tests for app.services.cdx_render — faithful CDX/CDXML -> SVG via cdx-render jar."""

import re
from pathlib import Path

import pytest

from app.services.cdx_render import render_cdx_svg

# A drawing whose content sits FAR from the CDX origin (origin-y ~= 181), so the
# stamped transform must carry a non-zero origin — unlike fixtures drawn near
# (0,0), where a wrong origin of (0,0) would still look correct.
_OFF_ORIGIN_CDXML = (
    Path(__file__).resolve().parent / "fixtures" / "reactions" / "forward.cdxml"
)


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


@pytest.mark.asyncio
async def test_render_svg_transform_maps_from_document_frame(started_app):
    """Regression guard for the occurrence-highlight transform.

    Occurrence bboxes are in the source-document frame, but the renderer
    normalizes its bounds to (0,0) and scales them by an internal 72/70 factor.
    The stamped transform must therefore carry the DOCUMENT-frame origin (not the
    normalized (0,0)) and the FULL document->SVG scale (render scale * 72/70),
    not the bare render scale. A revert to getBounds()/bare-scale would still
    pass the presence checks above but silently render highlights off-screen —
    this test pins the values on an off-origin drawing so that can't regress.
    """
    scale = 3.0
    svg = await render_cdx_svg(_OFF_ORIGIN_CDXML.read_bytes(), scale=scale)

    def _attr(name: str) -> float:
        m = re.search(rf'{name}="([-+\d.eE]+)"', svg)
        assert m, f"{name} missing from render output"
        return float(m.group(1))

    # Origin is the document-frame min corner; this drawing sits well off (0,0).
    assert _attr("data-cdx-origin-y") > 1.0, (
        "origin must be the document frame, not normalized (0,0)"
    )
    # Effective scale is render scale * the internal 72/70 normalization factor,
    # so strictly greater than the bare render scale.
    assert _attr("data-cdx-scale") > scale, (
        "scale must include the 72/70 normalization factor"
    )


@pytest.mark.asyncio
async def test_render_embeds_its_own_fonts(started_app, cdx_file_bytes: bytes):
    """The SVG must carry the faces it references.

    The viewer shows this SVG as an <img> blob, where page CSS never applies,
    and users download both the .svg and a canvas-rasterized .png. Without
    embedded faces every client substitutes a local font whose advance widths
    differ from the ones the JVM positioned the runs with.
    """
    svg = await render_cdx_svg(cdx_file_bytes)
    assert "@font-face" in svg
    assert "data:font/woff2;base64," in svg


@pytest.mark.asyncio
async def test_render_ships_no_proprietary_font_names(
    started_app, cdx_file_bytes: bytes
):
    svg = await render_cdx_svg(cdx_file_bytes)
    for outgoing in (
        "Arial MT",
        "Times New Roman WGL",
        "Courier10 WGL4 BT",
        "NimbusRoman",
    ):
        assert outgoing not in svg, f"{outgoing} must not reach the browser"
