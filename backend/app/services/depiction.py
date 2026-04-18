"""CDK SVG depiction via DepictionGenerator.

Renders publication-quality 2D structure SVGs from BCXSubstance atom
containers. Uses CDK's DepictionGenerator (bundled in BChemXtract JAR)
with the StandardGenerator for stereo wedges and atom labels.

Must be called inside run_in_jvm_thread (JVM-attached thread).
"""

from __future__ import annotations

import logging
import re
from typing import Any

import jpype

logger = logging.getLogger(__name__)

# Target SVG viewport size per D-02 (~400-500px publication quality)
SVG_TARGET_WIDTH = 450
SVG_TARGET_HEIGHT = 450


def _make_depiction_generator():
    """Shared DepictionGenerator factory.

    Publication-quality settings per D-02:
      - withAtomColors(): CPK coloring for atom labels
      - withFillToFit(): fill available space
      - IUPAC hydrogen visibility: show H only where stereo/chemically relevant
      - transparent background (no withBackgroundColor) for CSS

    Consumed by both :func:`render_substance_svg` and
    :func:`render_substance_svg_with_highlight`, and by the fragment-fallback
    path in :mod:`app.services.extractor`. Promoted to the depiction module
    (formerly private in extractor.py) so the match-highlight path can chain
    ``.withHighlight()`` off the same builder.

    Must be called inside a JVM-attached thread.
    """
    DepictionGenerator = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.depict.DepictionGenerator"
    )
    StandardGenerator = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.renderer.generators.standard.StandardGenerator"
    )
    SymbolVisibility = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.renderer.SymbolVisibility"
    )
    return (
        DepictionGenerator()
        .withAtomColors()
        .withFillToFit()
        .withParam(
            StandardGenerator.Visibility,
            SymbolVisibility.iupacRecommendations(),
        )
    )


def render_substance_svg(java_substance) -> str:
    """Render a BCXSubstance to SVG via CDK DepictionGenerator.

    Uses getAtomContainer() to preserve original ChemDraw 2D
    coordinates (no SMILES re-parsing or coordinate generation
    needed).

    Per D-03: returns empty string on any failure -- never raises.

    Args:
        java_substance: A Java BCXSubstance instance.

    Returns:
        Raw SVG markup string, or empty string if rendering fails.
    """
    try:
        container = java_substance.getAtomContainer()
        if container is None:
            return ""

        dg = _make_depiction_generator()
        depiction = dg.depict(container)
        svg_str = str(depiction.toSvgStr())

        # Post-process SVG to set target dimensions per D-02
        # CDK outputs mm-based dimensions; replace with pixel targets
        svg_str = _set_svg_dimensions(
            svg_str, SVG_TARGET_WIDTH, SVG_TARGET_HEIGHT
        )

        return svg_str
    except jpype.JException as exc:
        logger.warning(
            "CDK SVG rendering failed for substance: %s",
            str(exc),
        )
        return ""
    except Exception as exc:
        logger.warning(
            "Unexpected error during SVG rendering: %s",
            str(exc),
        )
        return ""


def _set_svg_dimensions(svg: str, width: int, height: int) -> str:
    """Replace width/height attributes on the root SVG element.

    CDK DepictionGenerator outputs SVG with mm-based dimensions.
    This replaces them with pixel values for consistent browser
    rendering.

    Args:
        svg: Raw SVG string from CDK.
        width: Target width in pixels.
        height: Target height in pixels.

    Returns:
        SVG string with updated width/height attributes.
    """
    svg = re.sub(
        r'width=["\'][^"\']*["\']',
        f'width="{width}px"',
        svg,
        count=1,
    )
    svg = re.sub(
        r'height=["\'][^"\']*["\']',
        f'height="{height}px"',
        svg,
        count=1,
    )
    return svg


def _inject_svg_title(svg: str, title: str) -> str:
    """Insert a <title> element right after the opening <svg> tag.

    Per UI-SPEC §Accessibility (Plan 09-04), substructure match SVGs embed
    ``<title>Matches {query}</title>`` so screen readers announce the match
    context. No-op when ``title`` is empty or the SVG has no ``<svg>`` root
    (already-malformed CDK output is left untouched).

    Minimal XML escaping on ``title`` prevents user-supplied SMARTS text
    from breaking the SVG structure (threat model T-09-04-02).

    Args:
        svg: Raw SVG markup.
        title: Accessibility title. Empty string skips injection.

    Returns:
        SVG markup with ``<title>`` inserted as the first child of the
        root ``<svg>``, or the original SVG if ``title`` is empty.
    """
    if not title or not svg:
        return svg
    safe = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # CDK prefixes its output with `<?xml ...?>` and a DOCTYPE, so the first
    # `>` in the document closes the XML prolog, NOT the root <svg>. Anchor
    # to the literal "<svg" and find the first `>` after it — that is the
    # real root opening tag's close.
    svg_open = svg.find("<svg")
    if svg_open < 0:
        return svg
    idx = svg.find(">", svg_open)
    if idx < 0:
        return svg
    return svg[: idx + 1] + f"<title>{safe}</title>" + svg[idx + 1 :]


def render_substance_svg_with_highlight(
    mol_or_substance: Any,
    atom_indices: list[int],
    title: str = "",
) -> str:
    """Render a substance to SVG with matched atoms tinted Apple Blue.

    Uses CDK ``DepictionGenerator.withHighlight(chemObjs, Color)`` per D-13.
    Color is ``--primary`` (#0071e3) at 0x40 alpha (~25%) per UI-SPEC §Color
    and RESEARCH §Pitfall 5. Bonds with both endpoints in the highlight set
    are included so matched bond strokes also receive the accent.

    Accepts either a ``BCXSubstance`` (``.getAtomContainer()`` is called) or
    an ``IAtomContainer`` directly — the latter is the shape the substructure
    iterate in :mod:`app.services.search` already holds per parsed row.

    Must be called inside a JVM-attached thread (``run_in_jvm_thread``).

    Failure policy (D-13, threat T-09-04-04):
      - Empty ``atom_indices`` → plain (non-highlighted) depiction.
      - ``None`` molecule → empty string.
      - Any JVM-side failure while drawing the highlight → fall back to the
        plain depiction so the search response still carries an SVG. If that
        plain fallback also fails, an empty string is returned.

    Args:
        mol_or_substance: ``BCXSubstance`` or CDK ``IAtomContainer``.
        atom_indices: 0-based atom positions to highlight.
        title: Optional ``<title>`` element for screen-reader a11y
            (UI-SPEC §Accessibility).

    Returns:
        SVG markup string. Non-empty on success or fallback; empty only
        when the molecule itself is absent.
    """
    if mol_or_substance is None:
        return ""

    # Resolve to an IAtomContainer — accept either BCXSubstance or container.
    if hasattr(mol_or_substance, "getAtomContainer"):
        container = mol_or_substance.getAtomContainer()
    else:
        container = mol_or_substance
    if container is None:
        return ""

    def _plain() -> str:
        """Local fallback: plain depiction with only the optional title."""
        try:
            dg = _make_depiction_generator()
            svg = str(dg.depict(container).toSvgStr())
            svg = _set_svg_dimensions(svg, SVG_TARGET_WIDTH, SVG_TARGET_HEIGHT)
            return _inject_svg_title(svg, title)
        except Exception as exc:  # noqa: BLE001 — last-resort guard
            logger.warning("Plain-depiction fallback failed: %s", exc)
            return ""

    # Fast path: no highlight requested.
    if not atom_indices:
        return _plain()

    try:
        Color = jpype.JClass("java.awt.Color")  # noqa: N806
        ArrayList = jpype.JClass("java.util.ArrayList")  # noqa: N806

        atom_count = int(container.getAtomCount())
        highlight_set: set[int] = {
            int(i) for i in atom_indices if 0 <= int(i) < atom_count
        }

        # If every requested index was out of range we have nothing to
        # highlight; fall back to the plain path so the response still
        # carries an SVG (matches UI-SPEC graceful-degradation contract).
        if not highlight_set:
            return _plain()

        chem_objs = ArrayList()
        for idx in sorted(highlight_set):
            chem_objs.add(container.getAtom(idx))
        # Include bonds whose both endpoints are in the highlight set so
        # bond strokes pick up the accent too (UI-SPEC: "1.5px stroke
        # outline on matched bonds").
        for b_idx in range(int(container.getBondCount())):
            bond = container.getBond(b_idx)
            a0 = int(container.indexOf(bond.getBegin()))
            a1 = int(container.indexOf(bond.getEnd()))
            if a0 in highlight_set and a1 in highlight_set:
                chem_objs.add(bond)

        # 0x0071E3 = Apple Blue (UI-SPEC §Color --primary); alpha 0x40 ≈ 25%
        # per RESEARCH §Pitfall 5. Four-arg form (r, g, b, a) — NOT the
        # packed-int single-arg form — so the alpha channel is honored.
        highlight_color = Color(0x00, 0x71, 0xE3, 0x40)

        dg = _make_depiction_generator().withHighlight(
            chem_objs, highlight_color
        )
        svg = str(dg.depict(container).toSvgStr())
        svg = _set_svg_dimensions(svg, SVG_TARGET_WIDTH, SVG_TARGET_HEIGHT)
        return _inject_svg_title(svg, title)
    except jpype.JException as exc:
        logger.warning(
            "Highlight SVG rendering failed (%s) — falling back to plain depiction",
            exc,
        )
        return _plain()
    except Exception as exc:  # noqa: BLE001 — never raise to search caller
        logger.warning(
            "Unexpected highlight error (%s) — falling back to plain depiction",
            exc,
        )
        return _plain()
