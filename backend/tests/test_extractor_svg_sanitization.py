"""Fragment-fallback / reaction SVG renderers sanitize before storing (CWE-79).

The extractor's own SVG renderers previously returned CDK output without
``sanitize_svg`` (only depiction.py's substance/search path sanitized). All
stored SVG must be inert, so the renderers now wrap their output. This pins the
representative fragment-fallback renderer; the reaction and CDK-layout
renderers use the identical ``sanitize_svg(sized)`` wrap.
"""

from __future__ import annotations

from app.services import extractor


class _FakeDepiction:
    def __init__(self, svg: str) -> None:
        self._svg = svg

    def toSvgStr(self) -> str:  # noqa: N802 — mirrors the CDK Java method name
        return self._svg


class _FakeDepictionGenerator:
    def __init__(self, svg: str) -> None:
        self._svg = svg

    def depict(self, _container: object) -> _FakeDepiction:
        return _FakeDepiction(self._svg)


_MALICIOUS_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
    "<script>alert(1)</script>"
    '<rect onload="evil()" x="0" y="0" width="10" height="10"/>'
    '<a xlink:href="javascript:evil()">x</a>'
    "</svg>"
)


def test_render_atom_container_svg_strips_scriptable_markup(monkeypatch) -> None:
    monkeypatch.setattr(
        extractor,
        "_make_depiction_generator",
        lambda: _FakeDepictionGenerator(_MALICIOUS_SVG),
    )

    out = extractor._render_atom_container_svg(object())

    assert out, "expected non-empty sanitized SVG"
    low = out.lower()
    assert "<script" not in low
    assert "onload=" not in low
    assert "javascript:" not in low
