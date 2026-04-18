"""Stubs for ReactionResponse.svg + ReactionExtractionResponse Pydantic models (Plan 01-01)."""
import pytest


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 01-01")
def test_reaction_response_has_svg():
    """D-04 amended: ReactionResponse has svg: str = "" field."""
    # from app.models.chemistry import ReactionResponse
    # r = ReactionResponse()
    # assert r.svg == ""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 01-01")
def test_reaction_response_accepts_svg_kwarg():
    """ReactionResponse(svg="<svg/>") validates — not extra fields forbidden (Pitfall 5)."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 01-01")
def test_reaction_extraction_response_shape():
    """D-04: ReactionExtractionResponse has reactions/format/filename/file_size/reaction_count/extraction_time_ms/warnings/extraction_id."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 01-01")
def test_export_request_accepts_reaction_ids():
    """D-22: ExportRequest.reaction_ids: list[int] = [] is accepted (mirrors substance_ids)."""
    pass
