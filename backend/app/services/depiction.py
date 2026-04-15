"""CDK SVG depiction via DepictionGenerator.

Renders publication-quality 2D structure SVGs from BCXSubstance atom
containers. Uses CDK's DepictionGenerator (bundled in BChemXtract JAR)
with the StandardGenerator for stereo wedges and atom labels.

Must be called inside run_in_jvm_thread (JVM-attached thread).
"""

import logging
import re

import jpype

logger = logging.getLogger(__name__)

# Target SVG viewport size per D-02 (~400-500px publication quality)
SVG_TARGET_WIDTH = 450
SVG_TARGET_HEIGHT = 450


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

        DepictionGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.depict.DepictionGenerator"
        )
        StandardGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.renderer.generators.standard.StandardGenerator"
        )
        SymbolVisibility = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.renderer.SymbolVisibility"
        )

        # Publication-quality settings per D-02:
        # - withAtomColors(): CPK coloring for atom labels
        # - withFillToFit(): fill available space
        # - IUPAC hydrogen visibility: show H only where stereo/chemically relevant
        # - transparent background (no withBackgroundColor) for CSS
        dg = (
            DepictionGenerator()
            .withAtomColors()
            .withFillToFit()
            .withParam(
                StandardGenerator.Visibility,
                SymbolVisibility.iupacRecommendations(),
            )
        )

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
