"""Stubs for save_reactions + dedup + cascade + orphan cleanup (Plan 02-02)."""
import pytest


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-02")
async def test_save_reactions_inserts_all_columns():
    """save_reactions writes long_rinchi_key + rinchi + reaction_smiles + svg + components JSONB."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-02")
async def test_save_reactions_deduplicates_by_long_rinchi_key():
    """D-18 amended: two identical reactions collapse to one Reaction row (ON CONFLICT DO NOTHING)."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-02")
async def test_save_reactions_synthetic_key_fallback():
    """Empty long_rinchi_key gets NO_RINCHI_{sha1(reaction_smiles)} synthetic key."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-02")
async def test_save_reactions_updates_extraction_reaction_count():
    """After save_reactions, Extraction.reaction_count == len(reactions) (D-16)."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-02")
async def test_delete_extraction_cascades_extraction_reactions():
    """D-21: deleting an Extraction removes its extraction_reactions rows (CASCADE)."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-02")
async def test_delete_extraction_cleans_orphan_reactions():
    """D-21: after deleting its sole Extraction, a Reaction with no joins is deleted."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-02")
async def test_delete_extraction_keeps_shared_reactions():
    """D-21: a Reaction linked to 2 extractions survives deletion of one."""
    pass
