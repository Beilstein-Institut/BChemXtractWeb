"""Stubs for extractor.extract_reactions_with_svg (Plan 01-03) + _render_reaction_svg.

All tests are skipped until Plan 01/02 implements the targets. Wave 0 guarantees
the file exists and collects cleanly so downstream <automated> verifies have a
real file to point pytest at.
"""
import pytest


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 01-03")
def test_extract_reactions_with_svg_renders_depiction():
    """When svg rendering succeeds, each reaction has a non-empty svg field (D-15)."""
    # from app.services.extractor import extract_reactions_with_svg
    # reactions, warnings = await extract_reactions_with_svg(file_bytes, "cdx")
    # assert reactions[0].svg != ""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 01-03")
def test_render_reaction_svg_empty_smiles_returns_empty():
    """_render_reaction_svg("") returns "" — no exception (D-13)."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 01-03")
def test_render_reaction_svg_invalid_smiles_returns_empty_with_warning():
    """Unparseable reaction_smiles returns "" + per-reaction warning (D-13)."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 01-03")
def test_render_reaction_svg_oversized_guarded():
    """Reaction SMILES > 1500 chars guarded (Pitfall 6 — MAX_REACTION_SMILES_LEN)."""
    pass
