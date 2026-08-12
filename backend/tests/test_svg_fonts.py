"""Tests for app.services.svg_fonts — face scanning and WOFF2 subset embedding."""

from app.services.svg_fonts import FaceKey, scan_faces

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
