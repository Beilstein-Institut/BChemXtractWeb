"""Tests for EXPO-08: MDLRXNWriter-backed RXN/RDF export (Plan 10 D-22 amended).

Covers:
- _generate_rxn_sync single-reaction output contains $RXN header
- _generate_rxn_sync multi-reaction output uses MDLRXNWriter native multi-record
- _generate_rxn_sync([]) returns b"" without crashing
- unparseable reaction_smiles are skipped (Pitfall 3)
- POST /api/export format=rxn routes through _fetch_reactions +
  generate_reactions_export (not the substance path)
- T-10-04 IDOR: stranger reaction_ids scoped by extraction_id -> 404
"""

from httpx import AsyncClient

from app.services.export import (
    _generate_rxn_sync,
    generate_reactions_export,
)
from app.services.jvm_bridge import run_in_jvm_thread


async def test_single_reaction_rxn_export(started_app):
    """EXPO-08: single-reaction input -> valid RXN bytes."""
    rxns = [{"reaction_smiles": "CC>>CCO", "id": 1, "long_rinchi_key": "K1"}]
    content = await run_in_jvm_thread(_generate_rxn_sync, rxns)
    assert len(content) > 0
    text = content.decode("utf-8")
    assert "$RXN" in text


async def test_multi_reaction_rxn_export(started_app):
    """D-22 amended: MDLRXNWriter.write(IReactionSet) emits multiple $RXN records."""
    rxns = [
        {"reaction_smiles": "CC>>CCO", "id": 1, "long_rinchi_key": "K1"},
        {"reaction_smiles": "CCC>>CCCO", "id": 2, "long_rinchi_key": "K2"},
    ]
    content = await run_in_jvm_thread(_generate_rxn_sync, rxns)
    text = content.decode("utf-8")
    # CDK MDLRXNWriter uses either $$$$ separator or multiple $RXN records
    assert "$$$$" in text or text.count("$RXN") == 2


async def test_empty_reaction_set_returns_empty_bytes(started_app):
    """_generate_rxn_sync([]) returns b"" -- no crash."""
    content = await run_in_jvm_thread(_generate_rxn_sync, [])
    assert content == b""


async def test_unparseable_reaction_smiles_skipped(started_app):
    """Reactions with invalid reaction_smiles (no ">") are skipped (Pitfall 3)."""
    rxns = [{"reaction_smiles": "no-arrow-here", "id": 1, "long_rinchi_key": "K1"}]
    content = await run_in_jvm_thread(_generate_rxn_sync, rxns)
    assert content == b""  # all skipped


async def test_generate_reactions_export_single_filename(started_app):
    """generate_reactions_export returns reaction.rxn for single reactions."""
    rxns = [{"reaction_smiles": "CC>>CCO", "id": 1, "long_rinchi_key": "K1"}]
    content, media_type, filename = await generate_reactions_export(rxns, "rxn")
    assert media_type == "chemical/x-mdl-rxnfile"
    assert filename == "reaction.rxn"
    assert "$RXN" in content.decode("utf-8")


async def test_generate_reactions_export_multi_filename(started_app):
    """generate_reactions_export returns reactions.rdf for multiple reactions."""
    rxns = [
        {"reaction_smiles": "CC>>CCO", "id": 1, "long_rinchi_key": "K1"},
        {"reaction_smiles": "CCC>>CCCO", "id": 2, "long_rinchi_key": "K2"},
    ]
    content, media_type, filename = await generate_reactions_export(rxns, "rxn")
    assert media_type == "chemical/x-mdl-rdfile"
    assert filename == "reactions.rdf"
    assert len(content) > 0


async def test_export_endpoint_rxn_dispatch(
    client: AsyncClient, cdx_reaction_file_bytes: bytes
) -> None:
    """POST /api/export format=rxn routes through _fetch_reactions + generate_reactions_export."""
    # First, run /api/reactions so reactions exist in DB
    ext_resp = await client.post(
        "/api/reactions",
        files={
            "file": ("simple_reaction.cdx", cdx_reaction_file_bytes, "chemical/x-cdx"),
        },
    )
    assert ext_resp.status_code == 200
    extraction_id = ext_resp.json()["extraction_id"]
    assert extraction_id is not None

    # Now export
    export_resp = await client.post(
        "/api/export",
        json={
            "format": "rxn",
            "extraction_id": extraction_id,
            "substance_ids": [],
            "reaction_ids": [],
        },
    )
    assert export_resp.status_code == 200
    media = export_resp.headers.get("content-type", "")
    assert "rxnfile" in media or "rdfile" in media
    assert len(export_resp.content) > 0


async def test_export_endpoint_rxn_idor_protection(
    client: AsyncClient, cdx_reaction_file_bytes: bytes
) -> None:
    """T-10-04: reaction_ids scoped to extraction_id -- stranger IDs -> 404."""
    ext_resp = await client.post(
        "/api/reactions",
        files={
            "file": ("simple_reaction.cdx", cdx_reaction_file_bytes, "chemical/x-cdx"),
        },
    )
    extraction_id = ext_resp.json()["extraction_id"]

    # Try to export with a made-up reaction_id 99999 + legitimate extraction_id
    export_resp = await client.post(
        "/api/export",
        json={
            "format": "rxn",
            "extraction_id": extraction_id,
            "substance_ids": [],
            "reaction_ids": [99999],
        },
    )
    assert export_resp.status_code == 404  # No reactions match
