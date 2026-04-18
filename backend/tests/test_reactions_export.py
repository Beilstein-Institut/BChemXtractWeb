"""Stubs for EXPO-08: MDLRXNWriter-based RXN/RDF export (Plan 02-03)."""
import pytest


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-03")
def test_single_reaction_rxn_export():
    """EXPO-08: _generate_rxn_sync(1 reaction) emits a valid single-record RXN file."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-03")
def test_multi_reaction_rxn_export():
    """EXPO-08: _generate_rxn_sync(N reactions) emits multi-record with $$$$ separator (D-22 amended: MDLRXNWriter only, no MDLRDFWriter)."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-03")
def test_empty_reaction_set_returns_empty_bytes():
    """_generate_rxn_sync([]) returns b"" — no crash (D-22 empty case)."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-03")
def test_unparseable_reaction_smiles_skipped():
    """Reactions with invalid reaction_smiles are skipped, export continues (Pitfall 3)."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-03")
async def test_export_endpoint_rxn_dispatch():
    """POST /api/export format=rxn routes to _fetch_reactions + generate_reactions_export (not substances)."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-03")
async def test_export_endpoint_rxn_idor_protection():
    """T-10-04: _fetch_reactions requires ExtractionReaction join (reaction_ids scoped by extraction_id)."""
    pass
