"""Tests for Reaction/ReactionExtraction/Export models."""

from app.models.chemistry import (
    ExportRequest,
    ReactionExtractionResponse,
    ReactionResponse,
)


def test_reaction_response_has_svg():
    """ReactionResponse has svg: str = "" field."""
    r = ReactionResponse()
    assert hasattr(r, "svg")
    assert r.svg == ""


def test_reaction_response_accepts_svg_kwarg():
    """ReactionResponse(svg=...) validates; extra fields not forbidden."""
    r = ReactionResponse(svg="<svg xmlns='http://www.w3.org/2000/svg'/>")
    assert "<svg" in r.svg


def test_reaction_extraction_response_shape():
    """ReactionExtractionResponse has all 8 required fields."""
    resp = ReactionExtractionResponse(
        reactions=[],
        format="cdx",
        filename="test.cdx",
        file_size=100,
        reaction_count=0,
        extraction_time_ms=12.5,
    )
    dumped = resp.model_dump()
    # Required fields
    for field in (
        "reactions",
        "format",
        "filename",
        "file_size",
        "reaction_count",
        "extraction_time_ms",
        "warnings",
        "extraction_id",
    ):
        assert field in dumped, f"missing field: {field}"
    assert dumped["warnings"] == []
    assert dumped["extraction_id"] is None


def test_export_request_accepts_reaction_ids():
    """ExportRequest.reaction_ids default [] accepted (mirrors substance_ids)."""
    req = ExportRequest(format="rxn", reaction_ids=[1, 2, 3])
    assert req.reaction_ids == [1, 2, 3]
    req2 = ExportRequest(format="sdf")  # default = []
    assert req2.reaction_ids == []


def test_pubchem_enrich_request_caps_items():
    """The batch endpoint rejects more than 50 items (bounds external fan-out)."""
    import pytest
    from pydantic import ValidationError

    from app.models.chemistry import PubChemEnrichItem, PubChemEnrichRequest

    items = [PubChemEnrichItem(inchi_key="A" * 14, smiles="C") for _ in range(51)]
    with pytest.raises(ValidationError):
        PubChemEnrichRequest(items=items)


def test_pubchem_enrichment_defaults():
    """An absent result carries no CID/url and empty tier-2 fields."""
    from app.models.chemistry import PubChemEnrichment

    e = PubChemEnrichment(inchi_key="UHOVQNZJYSORNB-UHFFFAOYSA-N", status="absent")
    assert e.cid is None
    assert e.pubchem_url is None
    assert e.synonyms == []
    assert e.connectivity_cid_count == 0
    assert e.status == "absent"
