"""Unit tests for render_substance_svg_cdk_layout.

Exercises the JPype-backed CDK layout renderer via a real BChemXtract
JAR. Tests depend on the session-scoped ``started_app`` fixture so the
JVM is initialised, and dispatch every JPype call through
``run_in_jvm_thread`` for thread-attach correctness.

We parse a real CDX fixture (L-lactic-acid) inside the JVM-attached
thread, so the BCXSubstance carries ChemDraw-authored 2D coordinates —
a prerequisite for asserting the CDK-re-laid-out SVG differs from the
original-coords SVG.
"""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_cdk_layout_returns_svg_for_simple_cdx(
    started_app, cdx_file_bytes
) -> None:
    """Both renderers return non-empty SVGs; CDK layout differs from CDX coords.

    Loads the L-lactic-acid fixture, extracts the first BCXSubstance via
    ``SubstanceXtractor.xtractUnique``, then renders it twice: once via
    :func:`render_substance_svg` (original ChemDraw coords) and once via
    :func:`render_substance_svg_cdk_layout` (fresh CDK 2D layout). The
    two SVGs must both be valid and must differ — the re-layout must
    change at least some atom/bond coordinates.
    """
    from app.services.depiction import (
        render_substance_svg,
        render_substance_svg_cdk_layout,
    )
    from app.services.extractor import _read_document
    from app.services.jvm_bridge import run_in_jvm_thread

    def _render() -> tuple[str, str]:
        import jpype

        document = _read_document(cdx_file_bytes, "cdx")
        BCXSubstanceInfo = jpype.JClass(  # noqa: N806
            "org.beilstein.chemxtract.model.BCXSubstanceInfo"
        )
        SubstanceXtractor = jpype.JClass(  # noqa: N806
            "org.beilstein.chemxtract.xtractor.SubstanceXtractor"
        )
        info = BCXSubstanceInfo()
        substances = SubstanceXtractor().xtractUnique(document, info)
        assert len(substances) >= 1, "fixture must yield at least one substance"
        substance = substances[0]
        return (
            render_substance_svg(substance),
            render_substance_svg_cdk_layout(substance),
        )

    cdx_svg, cdk_svg = await run_in_jvm_thread(_render)
    assert cdx_svg.startswith("<?xml") or cdx_svg.startswith("<svg")
    assert cdk_svg.startswith("<?xml") or cdk_svg.startswith("<svg")
    assert cdx_svg != cdk_svg, (
        "CDK re-layout should differ from the original-coords render"
    )


@pytest.mark.asyncio
async def test_cdk_layout_returns_empty_on_none(started_app) -> None:
    """Contract: empty string (never raises) on None input."""
    from app.services.depiction import render_substance_svg_cdk_layout
    from app.services.jvm_bridge import run_in_jvm_thread

    def _render() -> str:
        return render_substance_svg_cdk_layout(None)

    out = await run_in_jvm_thread(_render)
    assert out == ""
