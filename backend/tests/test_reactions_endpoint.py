"""Integration tests for POST /api/reactions + GET /api/extractions/{id}/reactions.

Plan 10 RXTN-01 / RXTN-04 / D-06 / D-23 / D-25.
"""
from httpx import AsyncClient


async def test_upload_cdx_returns_reactions(
    client: AsyncClient, cdx_reaction_file_bytes: bytes
) -> None:
    """RXTN-01: POST /api/reactions returns reactions from a real CDX file."""
    response = await client.post(
        "/api/reactions",
        files={
            "file": ("simple_reaction.cdx", cdx_reaction_file_bytes, "chemical/x-cdx"),
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "reactions" in data
    assert data["format"] == "cdx"
    assert data["filename"] == "simple_reaction.cdx"
    assert data["reaction_count"] >= 1
    assert data["extraction_time_ms"] >= 0
    assert isinstance(data["warnings"], list)
    assert data["extraction_id"] is not None


async def test_response_has_svg(
    client: AsyncClient, cdx_reaction_file_bytes: bytes
) -> None:
    """RXTN-02: At least one reaction has a rendered svg (matches plan-01 pattern).

    CDK's DepictionGenerator.toSvgStr() prefixes the SVG with an XML prolog,
    so we accept either "<svg" at the start or anywhere in the string
    (consistent with test_reactions.py::test_extract_reactions_with_svg_renders_depiction).
    """
    response = await client.post(
        "/api/reactions",
        files={"file": ("simple_reaction.cdx", cdx_reaction_file_bytes, "chemical/x-cdx")},
    )
    assert response.status_code == 200
    reactions = response.json()["reactions"]
    assert any(
        r["svg"].startswith("<svg") or "<svg" in r["svg"] for r in reactions
    ), f"No rendered SVG: {reactions!r}"


async def test_response_has_rinchi_fields(
    client: AsyncClient, cdx_reaction_file_bytes: bytes
) -> None:
    """RXTN-03: Every reaction has rinchi, short/long/web_rinchi_key, reaction_smiles."""
    response = await client.post(
        "/api/reactions",
        files={"file": ("simple_reaction.cdx", cdx_reaction_file_bytes, "chemical/x-cdx")},
    )
    reactions = response.json()["reactions"]
    for r in reactions:
        for field in ("rinchi", "short_rinchi_key", "long_rinchi_key",
                      "web_rinchi_key", "reaction_smiles"):
            assert field in r, f"RXTN-03 missing {field}"


async def test_timeout_returns_200_with_warning(
    client: AsyncClient,
    cdx_reaction_file_bytes: bytes,
    monkeypatch,
) -> None:
    """D-06: On timeout, returns HTTP 200 with reactions=[] + warning (NOT 408/503)."""
    from app.config import settings as app_settings
    monkeypatch.setattr(app_settings, "reaction_timeout_secs", 0.001)
    response = await client.post(
        "/api/reactions",
        files={"file": ("simple_reaction.cdx", cdx_reaction_file_bytes, "chemical/x-cdx")},
    )
    assert response.status_code == 200  # NOT 408/503
    data = response.json()
    assert data["reactions"] == []
    assert any("timeout" in w.lower() or "exceeded" in w.lower()
               for w in data["warnings"])


async def test_error_response_shapes(client: AsyncClient) -> None:
    """D-25: 415 errors return unified ErrorResponse shape."""
    # 415 -- not CDX/CDXML (send plain text)
    resp_415 = await client.post(
        "/api/reactions",
        files={"file": ("notachemfile.txt", b"hello world", "text/plain")},
    )
    assert resp_415.status_code == 415
    body = resp_415.json()
    assert "detail" in body and "code" in body
    assert body["code"] == "UNSUPPORTED_FORMAT"


async def test_substance_extraction_unaffected(
    client: AsyncClient, cdx_file_bytes: bytes
) -> None:
    """RXTN-04: /api/extract still returns substances after reactions router loads."""
    response = await client.post(
        "/api/extract",
        files={"file": ("L-lactic-acid.cdx", cdx_file_bytes, "chemical/x-cdx")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "substances" in data
    assert len(data["substances"]) > 0


async def test_get_extraction_reactions_returns_cached(
    client: AsyncClient, cdx_reaction_file_bytes: bytes
) -> None:
    """D-23: GET /api/extractions/{id}/reactions returns the cached reactions for hydration."""
    # First extract to populate the DB
    post_resp = await client.post(
        "/api/reactions",
        files={"file": ("simple_reaction.cdx", cdx_reaction_file_bytes, "chemical/x-cdx")},
    )
    assert post_resp.status_code == 200
    post_data = post_resp.json()
    extraction_id = post_data["extraction_id"]
    expected_count = post_data["reaction_count"]
    assert extraction_id is not None
    assert expected_count >= 1

    # Now hydrate via GET
    get_resp = await client.get(f"/api/extractions/{extraction_id}/reactions")
    assert get_resp.status_code == 200
    get_data = get_resp.json()
    assert get_data["extraction_id"] == extraction_id
    assert len(get_data["reactions"]) == expected_count
    # Shape mirrors ReactionResponse
    for r in get_data["reactions"]:
        for field in ("rinchi", "short_rinchi_key", "long_rinchi_key",
                      "reaction_smiles", "svg"):
            assert field in r


async def test_get_extraction_reactions_404_unknown_extraction(
    client: AsyncClient
) -> None:
    """GET /api/extractions/{id}/reactions returns 404 when extraction doesn't exist."""
    resp = await client.get("/api/extractions/999999999/reactions")
    assert resp.status_code == 404
    body = resp.json()
    assert "detail" in body


async def test_get_extraction_reactions_empty_when_no_reactions_saved(
    client: AsyncClient, cdx_file_bytes: bytes
) -> None:
    """D-23: extraction exists with reaction_count=0 -> 200 + reactions=[] (NOT 404)."""
    # Create a substance-only extraction (no reactions extracted for it)
    post_resp = await client.post(
        "/api/extract",
        files={"file": ("L-lactic-acid.cdx", cdx_file_bytes, "chemical/x-cdx")},
    )
    assert post_resp.status_code == 200
    extraction_id = post_resp.json()["extraction_id"]

    # GET should return 200 with empty reactions
    get_resp = await client.get(f"/api/extractions/{extraction_id}/reactions")
    assert get_resp.status_code == 200
    get_data = get_resp.json()
    assert get_data["reactions"] == []
    assert get_data["reaction_count"] == 0
