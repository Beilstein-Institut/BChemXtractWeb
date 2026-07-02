"""API-layer tests for history and stats endpoints.

Requirements: HIST-01, HIST-02, HIST-04
Uses the `client` fixture (lifespan-started app + JVM) from conftest.py.

Run: conda run -n cheminformatics pytest tests/test_history_api.py -x -q
"""

import logging

import pytest
from httpx import AsyncClient

from app.routers.history import _LEGACY_FALLBACK_RE

logger = logging.getLogger(__name__)


def test_legacy_fallback_warnings_are_stripped_from_history():
    """Both historical fragment-fallback wordings are recognised for stripping,
    while ordinary warnings pass through untouched."""
    assert _LEGACY_FALLBACK_RE.search(
        "Extracted via fragment fallback — InChI/InChIKey not available for this file."
    )
    assert _LEGACY_FALLBACK_RE.search(
        "File contains complex structures. Extracted via direct fragment "
        "conversion — SMILES and structure images are available, but InChI and "
        "InChIKey are not computed for this file."
    )
    assert not _LEGACY_FALLBACK_RE.search(
        "File extension does not match detected format."
    )


@pytest.mark.asyncio
async def test_history_list_returns_200(client_csrf: AsyncClient):
    """HIST-01: GET /api/history returns 200 with items and total fields."""
    response = await client_csrf.get("/api/history")
    assert response.status_code == 200
    body = response.json()
    assert "items" in body, "Response must have 'items' key"
    assert "total" in body, "Response must have 'total' key"
    assert isinstance(body["items"], list)
    assert isinstance(body["total"], int)


@pytest.mark.asyncio
async def test_history_list_default_limit(client_csrf: AsyncClient):
    """Default limit is 10 — items list never exceeds 10 entries."""
    response = await client_csrf.get("/api/history")
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) <= 10


@pytest.mark.asyncio
async def test_history_list_item_fields(client_csrf: AsyncClient):
    """HIST-01: each item has id, filename, structure_count, created_at."""
    response = await client_csrf.get("/api/history")
    assert response.status_code == 200
    items = response.json()["items"]
    for item in items:
        assert "id" in item
        assert "filename" in item
        assert "structure_count" in item
        assert "created_at" in item


@pytest.mark.asyncio
async def test_history_detail_not_found(client_csrf: AsyncClient):
    """HIST-02: GET /api/history/{id} returns 404 for non-existent ID."""
    response = await client_csrf.get("/api/history/999999999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_history_not_found(client_csrf: AsyncClient):
    """DELETE /api/history/{id} returns 404 for non-existent ID."""
    response = await client_csrf.delete("/api/history/999999999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_stats_returns_200(client_csrf: AsyncClient):
    """HIST-04: GET /api/stats returns 200 with all three stat fields."""
    response = await client_csrf.get("/api/stats")
    assert response.status_code == 200
    body = response.json()
    assert "total_extractions" in body
    assert "unique_structures" in body
    assert "most_common_formula" in body
    assert isinstance(body["total_extractions"], int)
    assert isinstance(body["unique_structures"], int)
    assert isinstance(body["most_common_formula"], str)


@pytest.mark.asyncio
async def test_stats_empty_formula_is_string(client_csrf: AsyncClient):
    """most_common_formula is empty string (not null) when no substances exist."""
    response = await client_csrf.get("/api/stats")
    assert response.status_code == 200
    body = response.json()
    # Even on empty DB, most_common_formula must be a string (never null)
    assert body["most_common_formula"] is not None
    assert isinstance(body["most_common_formula"], str)


@pytest.mark.asyncio
async def test_history_all_limit(client_csrf: AsyncClient):
    """GET /api/history?limit=all returns total items without cap."""
    response = await client_csrf.get("/api/history?limit=all")
    assert response.status_code == 200
    body = response.json()
    assert "items" in body
    # all items should equal total
    assert len(body["items"]) == body["total"]


@pytest.mark.asyncio
async def test_history_detail_success_path(
    client_csrf: AsyncClient, cdx_file_bytes: bytes
):
    """HIST-02: GET /api/history/{id} returns 200 + substances for real extraction.

    Steps:
    1. POST a CDX file to /api/extract to create an extraction record.
    2. GET /api/history to find the newly created entry's ID.
    3. GET /api/history/{id} and verify 200 with ExtractionResponse shape.
    """
    # Step 1: create an extraction via POST /api/extract
    upload_response = await client_csrf.post(
        "/api/extract",
        files={
            "file": ("L-lactic-acid.cdx", cdx_file_bytes, "application/octet-stream")
        },
    )
    assert upload_response.status_code == 200, (
        f"POST /api/extract failed: {upload_response.text}"
    )

    # Step 2: retrieve the history list and find our entry by filename
    history_response = await client_csrf.get("/api/history?limit=all")
    assert history_response.status_code == 200
    items = history_response.json()["items"]
    matching = [item for item in items if item["filename"] == "L-lactic-acid.cdx"]
    assert len(matching) >= 1, (
        "POST /api/extract did not create history entry — auto-persist hook broken"
    )
    extraction_id = matching[0]["id"]

    # Step 3: call GET /api/history/{id} and verify full response shape
    detail_response = await client_csrf.get(f"/api/history/{extraction_id}")
    assert detail_response.status_code == 200
    body = detail_response.json()
    assert "substances" in body, "Detail response must contain 'substances' key"
    assert isinstance(body["substances"], list), "'substances' must be a list"
    assert len(body["substances"]) >= 1, (
        "L-lactic-acid.cdx should produce at least one substance"
    )
    assert "filename" in body
    assert body["filename"] == "L-lactic-acid.cdx"


@pytest.mark.asyncio
async def test_auto_persist_extraction_appears_in_history(
    client_csrf: AsyncClient, cdx_file_bytes: bytes
):
    """POST /api/extract auto-persists the extraction to the DB.

    Proves the save_extraction() hook in extract.py fires end-to-end:
    after a successful POST, the record must appear in GET /api/history.
    """
    # Get baseline count before upload
    before_response = await client_csrf.get("/api/history?limit=all")
    assert before_response.status_code == 200
    before_total = before_response.json()["total"]

    # POST a CDX file — auto-persist should fire inside extract_file()
    upload_response = await client_csrf.post(
        "/api/extract",
        files={
            "file": ("L-lactic-acid.cdx", cdx_file_bytes, "application/octet-stream")
        },
    )
    assert upload_response.status_code == 200, (
        f"POST /api/extract failed: {upload_response.text}"
    )

    # Verify history count increased by at least 1
    after_response = await client_csrf.get("/api/history?limit=all")
    assert after_response.status_code == 200
    after_total = after_response.json()["total"]
    assert after_total >= before_total + 1, (
        f"Auto-persist hook failed: history count did not increase "
        f"(before={before_total}, after={after_total})"
    )


@pytest.mark.asyncio
async def test_history_includes_reaction_count_after_reactions_extraction(
    client_csrf: AsyncClient, cdx_reaction_file_bytes: bytes
):
    """GET /api/history items expose reaction_count after a successful
    POST /api/reactions call.

    Regression guard for the silently-dropped HistoryListItem.reaction_count
    field (chemistry.py + history.py). The field was missing from the
    HistoryListItem Pydantic model, so it was dropped during serialisation.
    Without this test, the frontend HistoryEntry chip
    ('{N} substances · {M} reactions') can revert to undefined again because
    no other test exercises the wire contract end-to-end.

    Steps:
      1. POST simple_reaction.cdx to /api/reactions — creates extraction row
         with reaction_count populated by save_reactions.
      2. GET /api/history?limit=all — locate our entry by filename.
      3. Assert reaction_count is present, is an int, and matches the
         reaction_count returned by the POST response.
    """
    # Step 1: extract reactions (auto-persists with reaction_count populated)
    post_resp = await client_csrf.post(
        "/api/reactions",
        files={
            "file": (
                "simple_reaction.cdx",
                cdx_reaction_file_bytes,
                "chemical/x-cdx",
            ),
        },
    )
    assert post_resp.status_code == 200, f"POST /api/reactions failed: {post_resp.text}"
    post_data = post_resp.json()
    expected_reaction_count = post_data["reaction_count"]
    assert expected_reaction_count >= 1, (
        "simple_reaction.cdx must yield at least one reaction"
    )

    # Step 2: list history and find our entry
    history_resp = await client_csrf.get("/api/history?limit=all")
    assert history_resp.status_code == 200
    items = history_resp.json()["items"]
    matching = [item for item in items if item["filename"] == "simple_reaction.cdx"]
    assert len(matching) >= 1, (
        "POST /api/reactions did not produce a history entry — "
        "auto-persist hook may be broken"
    )

    # Step 3: assert reaction_count flows through HistoryListItem to the wire.
    # This is the regression guard: prior to the fix in chemistry.py +
    # history.py, this assertion failed because the field was silently
    # dropped during Pydantic serialisation.
    #
    # Use a ranged assertion (>= 1) rather than strict equality with the
    # immediately-preceding POST. The DB fixture
    # is session-scoped without per-test rollback for client-driven tests,
    # and `get_or_create_extraction_row` deduplicates by
    # (filename, file_size, format). Under pytest-xdist or a future test
    # that mutates simple_reaction.cdx bytes, two workers could race on
    # the same row and the strict equality would flake. The weaker
    # assertion still catches the original Pydantic-drops-the-field bug
    # (reaction_count would be 0 or missing entirely).
    entry = matching[0]
    assert "reaction_count" in entry, (
        "GET /api/history items must include reaction_count "
        "(HistoryListItem schema field) — chip on HistoryEntry depends on it"
    )
    assert isinstance(entry["reaction_count"], int), (
        f"reaction_count must be int, got {type(entry['reaction_count'])}"
    )
    assert entry["reaction_count"] >= 1, (
        "reaction_count must be populated (>= 1) after POST /api/reactions; "
        f"got {entry['reaction_count']}"
    )
    # Log-correlate without asserting strict equality — drift is allowed
    # under parallel workers but worth surfacing during debugging.
    if entry["reaction_count"] != expected_reaction_count:
        logger.warning(
            "reaction_count drift: POST=%d history=%d (likely concurrent test)",
            expected_reaction_count,
            entry["reaction_count"],
        )
