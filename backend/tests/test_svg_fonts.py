"""Tests for app.services.svg_fonts — face scanning and WOFF2 subset embedding."""

import base64
import glob
import io
import re
from pathlib import Path

import pytest
from fontTools.ttLib import TTFont

from app.services.cdx_render import render_cdx_svg
from app.services.svg_fonts import (
    _FACE_FILES,
    FaceKey,
    _read_face_bytes,
    _subset_woff2,
    embed_subset_fonts,
    scan_faces,
)

# Mirrors Batik's svggen output: presentation attributes on <g>, inherited by
# <text>; family names single-quoted; weight and style as separate attributes.
_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" font-family="\'Dialog\'" '
    'font-size="12px">\n'
    '  <g font-family="\'Liberation Sans\'" font-size="8px">\n'
    '    <text x="1" y="2">B(OH)</text>\n'
    '    <text x="3" y="4" font-size="6px">2</text>\n'
    "  </g>\n"
    '  <g font-family="\'Liberation Serif\'" font-weight="bold">\n'
    '    <text x="5" y="6">1</text>\n'
    "  </g>\n"
    '  <g font-family="\'Liberation Sans\'" font-style="italic">\n'
    '    <text x="7" y="8">o</text>\n'
    "  </g>\n"
    "</svg>"
)


def test_scan_faces_groups_characters_by_face():
    faces = scan_faces(_SVG)
    assert faces[FaceKey("Liberation Sans", False, False)] == set("B(OH)2")
    assert faces[FaceKey("Liberation Serif", True, False)] == set("1")
    assert faces[FaceKey("Liberation Sans", False, True)] == set("o")


def test_scan_faces_ignores_the_unused_root_default():
    # Batik stamps font-family="'Dialog'" on the root <svg>, but no <text>
    # element resolves to it. Embedding a face for it would be dead weight.
    assert not any(key.family == "Dialog" for key in scan_faces(_SVG))


def test_scan_faces_returns_empty_for_textless_svg():
    empty_svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'
    assert scan_faces(empty_svg) == {}


@pytest.fixture
def jar_on_disk(monkeypatch):
    """Point the font reader at the built jar without starting a JVM."""
    pattern = str(Path(__file__).resolve().parents[1] / "jars" / "cdx-render-*.jar")
    jars = sorted(glob.glob(pattern))
    if not jars:
        pytest.skip("cdx-render jar not built; run backend/scripts/build_cdx_render.sh")
    monkeypatch.setattr(
        "app.services.svg_fonts.get_cdx_render_jar_path", lambda: jars[-1]
    )
    _read_face_bytes.cache_clear()
    _subset_woff2.cache_clear()
    yield
    _read_face_bytes.cache_clear()
    _subset_woff2.cache_clear()


def _embedded_faces(svg: str) -> dict[FaceKey, bytes]:
    """Decode every @font-face data URI in `svg`, keyed like `FaceKey`.

    Keyed on the full (family, bold, italic) triple -- not just family --
    because a family can have more than one face embedded (e.g. regular and
    italic share "Liberation Sans"); a family-only key would let one silently
    collide with the other depending on `_style_block`'s emission order. This
    way each test names the exact face it means.
    """
    out = {}
    for family, weight, style, b64 in re.findall(
        r"@font-face\{font-family:'([^']+)';font-weight:(\w+);"
        r"font-style:(\w+);[^}]*?base64,([A-Za-z0-9+/=]+)\)",
        svg,
    ):
        key = FaceKey(family=family, bold=weight == "bold", italic=style == "italic")
        out[key] = base64.b64decode(b64)
    return out


def test_embed_adds_woff2_font_face_rules(jar_on_disk):
    result = embed_subset_fonts(_SVG)
    faces = _embedded_faces(result)
    regular_sans = FaceKey("Liberation Sans", bold=False, italic=False)
    assert regular_sans in faces
    # WOFF2 magic number; proves brotli compression actually ran.
    assert faces[regular_sans][:4] == b"wOF2"


def test_embed_keeps_only_the_characters_the_drawing_uses(jar_on_disk):
    result = embed_subset_fonts(_SVG)
    regular_sans = FaceKey("Liberation Sans", bold=False, italic=False)
    font = TTFont(io.BytesIO(_embedded_faces(result)[regular_sans]))
    cmap = font.getBestCmap()
    for present in "B(OH)2":
        assert ord(present) in cmap, f"{present!r} was dropped from the subset"
    # 'Z' appears nowhere in the drawing, so it must not survive the subset.
    assert ord("Z") not in cmap


def test_embed_emits_a_separate_face_per_weight_and_style(jar_on_disk):
    # Batik varies weight and style independently, so a bold run and an italic
    # run of the same family need two distinct embedded faces.
    result = embed_subset_fonts(_SVG)
    assert result.count("@font-face") == 3
    assert "font-weight:bold" in result
    assert "font-style:italic" in result


def test_embed_disables_kerning_to_match_server_metrics(jar_on_disk):
    # Java2D measures without kerning (FontCreator never sets TextAttribute.KERNING),
    # so the browser must not apply it either or runs drift within themselves.
    assert "font-kerning:none" in embed_subset_fonts(_SVG)


def test_embed_preserves_the_root_tag_and_transform_attributes(jar_on_disk):
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" data-cdx-scale="3.0" '
        'viewBox="0 0 100 50">'
        '<g font-family="\'Liberation Sans\'"><text x="1" y="2">A</text></g></svg>'
    )
    result = embed_subset_fonts(svg)
    assert 'data-cdx-scale="3.0"' in result
    assert re.search(r'viewBox="0 0 \d+ \d+"', result)
    assert result.index("<style") > result.index("<svg")


def test_embed_returns_input_unchanged_when_subsetting_fails(jar_on_disk, monkeypatch):
    def _boom(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.services.svg_fonts._subset_woff2", _boom)
    assert embed_subset_fonts(_SVG) == _SVG


def test_embed_returns_input_unchanged_when_the_jar_is_missing(monkeypatch):
    # A deployment without the cdx-render jar already fails the render with a
    # 503; font embedding must not convert that into a different error.
    monkeypatch.setattr("app.services.svg_fonts.get_cdx_render_jar_path", lambda: None)
    _read_face_bytes.cache_clear()
    assert embed_subset_fonts(_SVG) == _SVG


def test_embed_returns_input_unchanged_for_textless_svg():
    svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'
    assert embed_subset_fonts(svg) == svg


@pytest.mark.asyncio
async def test_real_render_never_uses_a_face_we_cannot_embed(
    started_app, cdx_file_bytes: bytes
):
    """No <text> in a real render may resolve to a face outside _FACE_FILES.

    The Java-side font guard matches font-family with a regex over raw CDX
    strings, so it cannot resolve font-family attributes a <text> element
    inherits from an ancestor <g> -- it can prove a family string was never
    written, not that every <text> element actually resolves to an embeddable
    face. scan_faces walks the real, already-inherited SVG DOM instead, so it
    can catch what the Java guard structurally cannot: a <text> element that
    falls back to Batik's 'Dialog' default, or to any other family this
    module has no TTF for. That is the exact failure this whole feature
    exists to prevent, so it must be checked against a real render, not just
    the hand-built fixture the other tests in this file use.
    """
    svg = await render_cdx_svg(cdx_file_bytes)
    faces = scan_faces(svg)
    assert faces, "expected at least one text face in this fixture's render"
    for key in faces:
        assert (key.family, key.bold, key.italic) in _FACE_FILES, (
            f"{key} has no embeddable face; the browser will substitute a font "
            "whose advance widths do not match the JVM's layout"
        )
