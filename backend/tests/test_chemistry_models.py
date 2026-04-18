"""Tests for ReactionResponse.svg + ReactionExtractionResponse + ExportRequest.reaction_ids (Plan 10-01)."""
from app.models.chemistry import (
    ExportRequest,
    ReactionExtractionResponse,
    ReactionResponse,
)


def test_reaction_response_has_svg():
    """D-04 amended: ReactionResponse has svg: str = "" field."""
    r = ReactionResponse()
    assert hasattr(r, "svg")
    assert r.svg == ""


def test_reaction_response_accepts_svg_kwarg():
    """ReactionResponse(svg="<svg/>") validates — not extra fields forbidden (Pitfall 5)."""
    r = ReactionResponse(svg="<svg xmlns='http://www.w3.org/2000/svg'/>")
    assert "<svg" in r.svg


def test_reaction_extraction_response_shape():
    """D-04: ReactionExtractionResponse has all 8 required fields."""
    resp = ReactionExtractionResponse(
        reactions=[],
        format="cdx",
        filename="test.cdx",
        file_size=100,
        reaction_count=0,
        extraction_time_ms=12.5,
    )
    dumped = resp.model_dump()
    # D-04 required fields
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
        assert field in dumped, f"D-04 missing field: {field}"
    assert dumped["warnings"] == []
    assert dumped["extraction_id"] is None


def test_export_request_accepts_reaction_ids():
    """D-22: ExportRequest.reaction_ids: list[int] = [] is accepted (mirrors substance_ids)."""
    req = ExportRequest(format="rxn", reaction_ids=[1, 2, 3])
    assert req.reaction_ids == [1, 2, 3]
    req2 = ExportRequest(format="sdf")  # default = []
    assert req2.reaction_ids == []
