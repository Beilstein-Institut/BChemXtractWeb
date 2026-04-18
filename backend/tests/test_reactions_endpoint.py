"""Stubs for POST /api/reactions router (Plan 02-01).

All tests skipped in Wave 0. Implementation in Plan 02.
"""
import pytest


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-01")
async def test_upload_cdx_returns_reactions():
    """RXTN-01: POST /api/reactions with simple_reaction.cdx returns reactions list."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-01")
async def test_response_has_svg():
    """RXTN-02: Each returned reaction has non-empty svg (when depictable)."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-01")
async def test_response_has_rinchi_fields():
    """RXTN-03: Reaction response has rinchi, short/long/web_rinchi_key, reaction_smiles."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-01")
async def test_timeout_returns_200_with_warning():
    """D-06: On timeout, endpoint returns HTTP 200 with reactions=[] + warning (NOT 408/503)."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-01")
async def test_error_response_shapes():
    """D-25: 413/415/422/500 return ErrorResponse shape (detail, code, fields)."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-01")
async def test_substance_extraction_unaffected():
    """RXTN-04: POST /api/extract still works after reactions router registers."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-01")
async def test_get_extraction_reactions_returns_cached():
    """D-23: GET /api/extractions/{id}/reactions returns cached reactions for history hydration."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-01")
async def test_get_extraction_reactions_404_unknown_extraction():
    """GET /api/extractions/{id}/reactions returns 404 when extraction doesn't exist."""
    pass


@pytest.mark.skip(reason="Wave 0 stub — implemented in Plan 02-01")
async def test_get_extraction_reactions_empty_when_no_reactions_saved():
    """GET /api/extractions/{id}/reactions returns 200 with reactions=[] when reaction_count=0."""
    pass
