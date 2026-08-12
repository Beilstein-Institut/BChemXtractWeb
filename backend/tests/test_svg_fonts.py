"""Tests for app.services.svg_fonts — face scanning and WOFF2 subset embedding."""

import base64
import glob
import io
import re
from pathlib import Path

import pytest
from fontTools.ttLib import TTFont

from app.services.svg_fonts import (
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


def _embedded_faces(svg: str) -> dict[str, bytes]:
    """Decode every @font-face data URI in `svg`, keyed by declared family.

    A family can have more than one face embedded (e.g. regular + italic);
    `setdefault` keeps the first (which `_style_block` sorts to be the plain
    regular/non-bold/non-italic one when there's a collision) rather than
    letting a later bold/italic rule silently overwrite it.
    """
    out = {}
    for family, b64 in re.findall(
        r"@font-face\{font-family:'([^']+)';[^}]*?base64,([A-Za-z0-9+/=]+)\)", svg
    ):
        out.setdefault(family, base64.b64decode(b64))
    return out


def test_embed_adds_woff2_font_face_rules(jar_on_disk):
    result = embed_subset_fonts(_SVG)
    faces = _embedded_faces(result)
    assert "Liberation Sans" in faces
    # WOFF2 magic number; proves brotli compression actually ran.
    assert faces["Liberation Sans"][:4] == b"wOF2"


def test_embed_keeps_only_the_characters_the_drawing_uses(jar_on_disk):
    result = embed_subset_fonts(_SVG)
    font = TTFont(io.BytesIO(_embedded_faces(result)["Liberation Sans"]))
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
