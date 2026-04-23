"""Unit tests for backend/app/services/depiction.py (Plan 09-04).

Covers render_substance_svg_with_highlight behavior in isolation — both the
happy path (Apple Blue tint on matched atoms) and the graceful-fallback
contract (render failure → plain SVG, never empty when a fallback exists).

The highlight helper requires the JVM, so every test depends on the
session-scoped started_app fixture (conftest.py) and dispatches the JVM
call through run_in_jvm_thread for thread-attach correctness.
"""

from __future__ import annotations

import jpype
import pytest


def _benzene_container():
    """Return a freshly-parsed CDK IAtomContainer for benzene (c1ccccc1).

    Must be called inside a JVM-attached thread. The caller wraps this in
    run_in_jvm_thread so the JPype worker owns the thread-attach.
    """
    SilentChemObjectBuilder = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.silent.SilentChemObjectBuilder"
    )
    SmilesParser = jpype.JClass("org.openscience.cdk.smiles.SmilesParser")  # noqa: N806
    builder = SilentChemObjectBuilder.getInstance()
    return SmilesParser(builder).parseSmiles("c1ccccc1")


@pytest.mark.asyncio
async def test_highlight_empty_list_falls_back_to_plain_svg(started_app) -> None:
    """Empty atom_indices → non-empty SVG identical in shape to the plain path.

    Guards UI-SPEC contract: "Empty list → fallback to render_substance_svg".
    """
    from app.services.depiction import render_substance_svg_with_highlight
    from app.services.jvm_bridge import run_in_jvm_thread

    def _call() -> str:
        return render_substance_svg_with_highlight(_benzene_container(), [])

    svg = await run_in_jvm_thread(_call)
    assert svg, "fallback SVG must be non-empty"
    assert "<svg" in svg
    # No highlight color in the fallback path
    assert "0071e3" not in svg.lower()


@pytest.mark.asyncio
async def test_highlight_benzene_contains_apple_blue(started_app) -> None:
    """All 6 benzene atoms highlighted → SVG contains Apple Blue #0071e3.

    UI-SPEC §Color: match-highlight fill = rgba(0, 113, 227, 0.20-0.25).
    RESEARCH §Pitfall 5: CDK DepictionGenerator emits the color as either
    hex "0071e3" or rgb/rgba fragment — either form counts as a pass.
    """
    from app.services.depiction import render_substance_svg_with_highlight
    from app.services.jvm_bridge import run_in_jvm_thread

    def _call() -> str:
        return render_substance_svg_with_highlight(
            _benzene_container(), [0, 1, 2, 3, 4, 5], title="Matches c1ccccc1"
        )

    svg = await run_in_jvm_thread(_call)
    assert svg, "highlight SVG must be non-empty"
    svg_lower = svg.lower()
    # CDK emits the highlight color either as a hex literal or an
    # rgba(...) fragment — accept all forms (with or without spaces).
    svg_compact = svg.replace(" ", "").lower()
    assert (
        "0071e3" in svg_lower
        or "rgba(0,113,227" in svg_compact
        or "rgb(0,113,227" in svg_compact
    ), "highlighted SVG must contain Apple Blue color per UI-SPEC §Color"


@pytest.mark.asyncio
async def test_highlight_accessibility_title_inserted(started_app) -> None:
    """With non-empty title, SVG contains <title>Matches …</title> a11y tag.

    UI-SPEC §Accessibility: "Substructure match-highlight SVG includes
    <title>Matches {query}</title> as the first child of the <svg>."
    """
    from app.services.depiction import render_substance_svg_with_highlight
    from app.services.jvm_bridge import run_in_jvm_thread

    def _call() -> str:
        return render_substance_svg_with_highlight(
            _benzene_container(), [0, 1, 2, 3, 4, 5], title="Matches c1ccccc1"
        )

    svg = await run_in_jvm_thread(_call)
    assert "<title>Matches c1ccccc1</title>" in svg


@pytest.mark.asyncio
async def test_highlight_none_mol_returns_empty_string(started_app) -> None:
    """None input short-circuits to empty string (like render_substance_svg)."""
    from app.services.depiction import render_substance_svg_with_highlight
    from app.services.jvm_bridge import run_in_jvm_thread

    def _call() -> str:
        return render_substance_svg_with_highlight(None, [0, 1, 2])

    svg = await run_in_jvm_thread(_call)
    assert svg == ""


@pytest.mark.asyncio
async def test_highlight_bad_indices_falls_back_gracefully(started_app) -> None:
    """Out-of-range atom indices → fall back to non-highlighted SVG (not empty).

    Degradation contract: render helper must never raise to the caller.
    """
    from app.services.depiction import render_substance_svg_with_highlight
    from app.services.jvm_bridge import run_in_jvm_thread

    def _call() -> str:
        # Benzene has 6 atoms; index 99 is invalid. The helper must either
        # tolerate it (via the 0 <= idx < atomCount guard) or fall through
        # to the plain depiction. Either way, the output must be non-empty.
        return render_substance_svg_with_highlight(_benzene_container(), [99])

    svg = await run_in_jvm_thread(_call)
    assert svg, "out-of-range indices must not yield an empty SVG"
    assert "<svg" in svg
