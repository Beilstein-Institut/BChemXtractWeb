"""CDK SVG depiction via DepictionGenerator.

Renders publication-quality 2D structure SVGs from BCXSubstance atom
containers. Uses CDK's DepictionGenerator (bundled in BChemXtract JAR)
with the StandardGenerator for stereo wedges and atom labels.

Must be called inside run_in_jvm_thread (JVM-attached thread).

Security: CDK's SVG writer is trusted, but any future CVE
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

# Target SVG viewport size (~400-500px publication quality)
SVG_TARGET_WIDTH = 450
SVG_TARGET_HEIGHT = 450

# SVG sanitiser ------------------------------------------------------------
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


def sanitize_svg(svg: str, *, strip_backdrop: bool = True) -> str:
    """Strip scriptable constructs, optionally also CDK's white backdrop.

    Removes (always, regardless of ``strip_backdrop``):
      * ``<script>...</script>`` tags
      * ``<foreignObject>...</foreignObject>`` blocks (they host HTML)
      * ``on*="..."`` event-handler attributes
      * ``href``/``xlink:href``/``src`` values with a ``javascript:`` scheme

    Removes additionally when ``strip_backdrop`` is True (the default):
      * CDK DepictionGenerator's opaque white background ``<rect/>`` so the
        parent container's own background shows through (matches the theme
        instead of clashing as a white patch on dark / tinted backgrounds).

    ``strip_backdrop=False`` is for faithful (non-CDK) renderers -- e.g. the
    Batik-backed cdx-render output -- where a white, unstroked ``<rect/>`` can
    be a legitimate occlusion mask in the original ChemDraw drawing rather
    than CDK's synthetic canvas backdrop. Stripping it there would silently
    corrupt the faithful layout.

    Args:
        svg: Raw SVG markup as produced by CDK or the faithful renderer.
        strip_backdrop: When True, also strip CDK's white background rect.
            Set False for non-CDK/faithful renderers. Keyword-only.

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
    if strip_backdrop:
        raw = _CDK_WHITE_BACKGROUND_RECT_RE.sub(b"", raw)
    return raw.decode("utf-8", errors="replace")


def _make_depiction_generator():
    """Shared DepictionGenerator factory.

    Publication-quality settings:
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
    return sanitize_svg(svg)


def render_substance_svg(java_substance) -> str:
    """Render a BCXSubstance to SVG via CDK DepictionGenerator.

    Uses getAtomContainer() to preserve original ChemDraw 2D
    coordinates (no SMILES re-parsing or coordinate generation
    needed).

    Returns empty string on any failure -- never raises.

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
    except Exception as exc:  # noqa: BLE001 — never raise from SVG render
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

    For accessibility, substructure match SVGs embed
    ``<title>Matches {query}</title>`` so screen readers announce the match
    context. No-op when ``title`` is empty or the SVG has no ``<svg>`` root
    (already-malformed CDK output is left untouched).

    Minimal XML escaping on ``title`` prevents user-supplied SMARTS text
    from breaking the SVG structure.

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
    bond_indices: list[int] | None = None,
    title: str = "",
) -> str:
    """Render a substance to SVG with matched atoms + bonds tinted Apple Blue.

    ``bond_indices`` is an explicit parameter. The previous
    implementation inferred bonds from the atom-union set, which was
    correct when uniqueAtoms() collapsed all mappings to one — but wrong
    after the algorithm rewrite accumulates ALL mappings, so callers must
    pass the bonds they actually want highlighted.

    When ``bond_indices`` is ``None``, the function falls back to the
    legacy atom-union inference for backward compat with any caller that
    hasn't been updated yet. New callers should always pass an explicit
    list.

    Args:
        mol_or_substance: BCXSubstance or CDK IAtomContainer.
        atom_indices: 0-based atom positions to highlight.
        bond_indices: 0-based bond positions to highlight. None triggers
            legacy atom-union inference.
        title: Optional <title> for screen-reader a11y.

    Returns:
        SVG markup string. Non-empty on success or fallback.
    """
    if mol_or_substance is None:
        return ""

    if hasattr(mol_or_substance, "getAtomContainer"):
        container = mol_or_substance.getAtomContainer()
    else:
        container = mol_or_substance
    if container is None:
        return ""

    def _plain() -> str:
        try:
            return _inject_svg_title(_depict_container_to_svg(container), title)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Plain-depiction fallback failed: %s", exc)
            return ""

    if not atom_indices and not bond_indices:
        return _plain()

    try:
        Color = jpype.JClass("java.awt.Color")  # noqa: N806
        ArrayList = jpype.JClass("java.util.ArrayList")  # noqa: N806

        atom_count = int(container.getAtomCount())
        bond_count = int(container.getBondCount())

        highlight_atoms: set[int] = {
            int(i) for i in atom_indices if 0 <= int(i) < atom_count
        }
        if bond_indices is None:
            # Legacy atom-union inference — kept for callers that still
            # pass atom_indices only. New code always passes explicit
            # bond_indices; this branch is preserved so in-flight
            # non-substructure callers (none currently) don't break.
            highlight_bonds: set[int] = set()
            for b_idx in range(bond_count):
                bond = container.getBond(b_idx)
                a0 = int(container.indexOf(bond.getBegin()))
                a1 = int(container.indexOf(bond.getEnd()))
                if a0 in highlight_atoms and a1 in highlight_atoms:
                    highlight_bonds.add(b_idx)
        else:
            highlight_bonds = {int(i) for i in bond_indices if 0 <= int(i) < bond_count}

        if not highlight_atoms and not highlight_bonds:
            return _plain()

        chem_objs = ArrayList()
        for idx in sorted(highlight_atoms):
            chem_objs.add(container.getAtom(idx))
        for idx in sorted(highlight_bonds):
            chem_objs.add(container.getBond(idx))

        highlight_color = Color(0x00, 0x71, 0xE3, 0x40)
        dg = _make_depiction_generator().withHighlight(chem_objs, highlight_color)
        return _inject_svg_title(_depict_container_to_svg(container, dg), title)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Highlight SVG rendering failed (%s) — falling back to plain depiction",
            exc,
        )
        return _plain()
