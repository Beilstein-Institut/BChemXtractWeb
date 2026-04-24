"""CDK SVG depiction via DepictionGenerator.

Renders publication-quality 2D structure SVGs from BCXSubstance atom
containers. Uses CDK's DepictionGenerator (bundled in BChemXtract JAR)
with the StandardGenerator for stereo wedges and atom labels.

Must be called inside run_in_jvm_thread (JVM-attached thread).

Security (SEC L-05): CDK's SVG writer is trusted, but any future CVE
that causes it to emit ``<script>``, ``<foreignObject>``, or ``on*=``
event-handler attributes would become a stored-XSS vector once the SVG
is rendered inline. Every string returned by this module runs through
:func:`sanitize_svg` which strips those constructs before storage.
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

# SEC L-05 SVG sanitiser ---------------------------------------------------
# Defence in depth against a hypothetical CDK CVE that causes the SVG
# writer to emit script-bearing content. Regex-based because (a) we own
# both ends — CDK's output is well-formed by construction — and (b)
# introducing an lxml round-trip would double SVG generation cost for
# every depiction.

_SCRIPT_RE = re.compile(
    rb"<\s*script\b[^>]*>.*?<\s*/\s*script\s*>",
    re.IGNORECASE | re.DOTALL,
)
_FOREIGN_OBJECT_RE = re.compile(
    rb"<\s*foreignObject\b[^>]*>.*?<\s*/\s*foreignObject\s*>",
    re.IGNORECASE | re.DOTALL,
)
_ON_EVENT_ATTR_RE = re.compile(
    rb"\s+on[a-zA-Z]+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s/>]+)",
    re.IGNORECASE,
)
_JAVASCRIPT_URL_RE = re.compile(
    rb"(href|xlink:href|src)\s*=\s*([\"'])\s*javascript:[^\"']*\2",
    re.IGNORECASE,
)

# Matches CDK's opaque-white background rect:
#   <rect x='.0' y='.0' width='31.0' height='38.0' fill='#FFFFFF' stroke='none'/>
# DepictionGenerator emits this as the first element inside the root <g>
# group to paint a white canvas behind the chemistry. That hard white
# rectangle clashes with themed container backgrounds (dark-mode navy,
# light-mode cream), producing a visible "white patch" with unfilled
# margins. Stripping it lets the parent div's background show through —
# the black strokes stay visible on any theme.
#
# Strict matcher: requires BOTH a white fill AND stroke='none' on a
# self-closing <rect/>. That combination is unique to CDK's backdrop;
# chemistry atoms / bonds never render as self-closing rects without a
# stroke, and highlight boxes always carry a non-none stroke or alpha
# channel in the fill. False-positive risk is negligible.
_CDK_WHITE_BACKGROUND_RECT_RE = re.compile(
    rb"<\s*rect\b"
    rb"(?=[^>]*\bfill\s*=\s*[\"'](?:#[fF]{6}|white)[\"'])"
    rb"(?=[^>]*\bstroke\s*=\s*[\"']none[\"'])"
    rb"[^>]*/\s*>",
    re.IGNORECASE,
)


def sanitize_svg(svg: str) -> str:
    """Strip scriptable constructs + CDK's white backdrop (SEC L-05).

    Removes:
      * ``<script>...</script>`` tags
      * ``<foreignObject>...</foreignObject>`` blocks (they host HTML)
      * ``on*="..."`` event-handler attributes
      * ``href``/``xlink:href``/``src`` values with a ``javascript:`` scheme
      * CDK DepictionGenerator's opaque white background ``<rect/>`` so the
        parent container's own background shows through (matches the theme
        instead of clashing as a white patch on dark / tinted backgrounds).

    Args:
        svg: Raw SVG markup as produced by CDK.

    Returns:
        Sanitised SVG markup. Empty string if ``svg`` is empty or None.
    """
    if not svg:
        return ""
    raw = svg.encode("utf-8", errors="replace")
    raw = _SCRIPT_RE.sub(b"", raw)
    raw = _FOREIGN_OBJECT_RE.sub(b"", raw)
    raw = _ON_EVENT_ATTR_RE.sub(b"", raw)
    raw = _JAVASCRIPT_URL_RE.sub(rb"\1=\2#\2", raw)
    raw = _CDK_WHITE_BACKGROUND_RECT_RE.sub(b"", raw)
    return raw.decode("utf-8", errors="replace")


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


def _depict_container_to_svg(container, dg=None) -> str:
    """Depict ``container``, resize to target dims, sanitise, and return.

    Shared tail for every substance-depiction path so sizing + sanitising
    are applied identically. ``dg`` lets callers inject a highlight-
    enabled generator; when ``None``, builds the default one.
    """
    depict_gen = dg if dg is not None else _make_depiction_generator()
    svg = str(depict_gen.depict(container).toSvgStr())
    svg = _set_svg_dimensions(svg, SVG_TARGET_WIDTH, SVG_TARGET_HEIGHT)
    return sanitize_svg(svg)  # SEC L-05


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
        return _depict_container_to_svg(container)
    except Exception as exc:  # noqa: BLE001 — D-03: never raise from SVG render
        logger.warning("CDK SVG rendering failed for substance: %s", exc)
        return ""


def render_substance_svg_cdk_layout(java_substance) -> str:
    """Render a BCXSubstance to SVG with a fresh CDK 2D layout.

    Unlike :func:`render_substance_svg` (which depicts the container's
    existing ChemDraw coordinates), this function runs the atom container
    through :class:`StructureDiagramGenerator.generateCoordinates` first,
    so the result is CDK's canonical layout — often cleaner for complex
    structures where the ChemDraw layout has long crossing bonds.

    Contract matches the sibling renderer: returns empty string on any
    failure, never raises. Must be called inside a JVM-attached thread.
    """
    try:
        if java_substance is None:
            return ""
        container = java_substance.getAtomContainer()
        if container is None:
            return ""

        StructureDiagramGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.layout.StructureDiagramGenerator"
        )
        sdg = StructureDiagramGenerator()
        sdg.setMolecule(container)
        sdg.generateCoordinates()
        laid_out = sdg.getMolecule()
        return _depict_container_to_svg(laid_out)
    except Exception as exc:  # noqa: BLE001 — contract: never raise
        logger.warning("CDK-layout SVG rendering failed for substance: %s", exc)
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
            return _inject_svg_title(_depict_container_to_svg(container), title)
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
        dg = _make_depiction_generator().withHighlight(chem_objs, highlight_color)
        return _inject_svg_title(_depict_container_to_svg(container, dg), title)
    except Exception as exc:  # noqa: BLE001 — never raise to search caller
        logger.warning(
            "Highlight SVG rendering failed (%s) — falling back to plain depiction",
            exc,
        )
        return _plain()
