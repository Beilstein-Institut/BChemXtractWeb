"""Tests for the SVG sanitiser (SEC L-05).

Defence-in-depth against a hypothetical CDK CVE that emits scriptable
content. Every depiction path runs through :func:`sanitize_svg` before
storage.
"""

from __future__ import annotations

from app.services.depiction import sanitize_svg


def test_empty_input_returns_empty() -> None:
    assert sanitize_svg("") == ""
    assert sanitize_svg(None) == ""  # type: ignore[arg-type]


def test_benign_svg_unchanged() -> None:
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
        '<circle cx="5" cy="5" r="3"/></svg>'
    )
    assert sanitize_svg(svg) == svg


def test_script_tag_stripped() -> None:
    svg = '<svg><script>alert(1)</script><circle cx="1" cy="1" r="1"/></svg>'
    out = sanitize_svg(svg)
    assert "script" not in out.lower()
    assert "alert" not in out
    assert "<circle" in out


def test_script_tag_with_attrs_stripped() -> None:
    svg = '<svg><script type="text/javascript">alert(1)</script></svg>'
    out = sanitize_svg(svg)
    assert "script" not in out.lower()
    assert "alert" not in out


def test_foreign_object_stripped() -> None:
    svg = (
        "<svg>"
        '<foreignObject width="100" height="100">'
        '<body onload="alert(1)"><b>x</b></body>'
        "</foreignObject>"
        '<circle cx="1" cy="1" r="1"/>'
        "</svg>"
    )
    out = sanitize_svg(svg)
    assert "foreignObject" not in out
    assert "onload" not in out
    assert "<circle" in out


def test_onclick_attribute_stripped() -> None:
    svg = '<svg><rect onclick="alert(1)" x="0" y="0"/></svg>'
    out = sanitize_svg(svg)
    assert "onclick" not in out.lower()
    assert "<rect " in out or "<rect/" in out


def test_various_event_handlers_stripped() -> None:
    for handler in ("onload", "onerror", "onmouseover", "onfocus", "ontouchend"):
        svg = f'<svg><rect {handler}="alert(1)" x="0"/></svg>'
        out = sanitize_svg(svg)
        assert handler not in out.lower(), handler


def test_javascript_href_neutralised() -> None:
    svg = '<svg><a href="javascript:alert(1)">click</a></svg>'
    out = sanitize_svg(svg)
    assert "javascript:" not in out.lower()


def test_javascript_xlink_href_neutralised() -> None:
    svg = '<svg><use xlink:href="javascript:alert(1)"/></svg>'
    out = sanitize_svg(svg)
    assert "javascript:" not in out.lower()


def test_mixed_case_event_handler_stripped() -> None:
    svg = '<svg><rect OnClick="alert(1)" x="0"/></svg>'
    out = sanitize_svg(svg)
    assert "OnClick" not in out
    assert "onclick" not in out.lower()


def test_unicode_content_preserved() -> None:
    svg = "<svg><text>Caffeine: C₈H₁₀N₄O₂</text></svg>"
    out = sanitize_svg(svg)
    assert "Caffeine" in out
    assert "C₈H₁₀N₄O₂" in out
