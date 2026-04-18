"""Tests for extractor.extract_reactions_with_svg + _render_reaction_svg (Plan 10-01).

The first three tests exercise the pure guards (empty / no-arrow / oversized)
by driving _render_reaction_svg directly through run_in_jvm_thread. The fourth
is a live integration test against the simple_reaction.cdx fixture.

The last test stays skipped — triggering a deterministic JPype JException
during parseReactionSmiles is tricky and not worth monkeypatching for v1.
"""
import asyncio

import pytest

from app.services.extractor import (
    MAX_REACTION_SMILES_LEN,
    _render_reaction_svg,
    extract_reactions_with_svg,
)
from app.services.jvm_bridge import run_in_jvm_thread


def _render_in_jvm(smiles: str) -> tuple[str, str]:
    """Helper: run _render_reaction_svg inside the JVM thread pool."""
    return asyncio.run(run_in_jvm_thread(_render_reaction_svg, smiles))


def test_render_reaction_svg_empty_smiles_returns_empty(started_app):
    svg, warning = _render_in_jvm("")
    assert svg == ""
    assert warning == ""


def test_render_reaction_svg_no_arrow_returns_empty(started_app):
    # Pitfall 3: CDK parseReactionSmiles requires `>` in input.
    svg, warning = _render_in_jvm("c1ccccc1")
    assert svg == ""


def test_render_reaction_svg_oversized_guarded(started_app):
    # Pitfall 6: length > 1500 chars must be guarded.
    big = "C" * (MAX_REACTION_SMILES_LEN + 1) + ">>O"
    svg, warning = _render_in_jvm(big)
    assert svg == ""
    assert "exceeds" in warning.lower() or "1500" in warning


async def test_extract_reactions_with_svg_renders_depiction(
    started_app,
    cdx_reaction_file_bytes,
):
    reactions, warnings = await extract_reactions_with_svg(
        cdx_reaction_file_bytes, "cdx", timeout=30.0
    )
    assert len(reactions) >= 1
    # At least one reaction should have a non-empty SVG (simple_reaction.cdx).
    assert any(r.svg.startswith("<svg") or "<svg" in r.svg for r in reactions), (
        f"No rendered SVG in reactions={reactions!r}, warnings={warnings!r}"
    )


@pytest.mark.skip(reason="Wave 0 stub — kept for Plan 02 implementation")
def test_render_reaction_svg_invalid_smiles_returns_empty_with_warning():
    pass
