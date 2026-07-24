"""Tests for GET /api/extractions/{id}/render.svg -- faithful whole-page
CDX/CDXML render from stored bytes.

Covers: success (real JVM round-trip through /api/extract, which stores the
uploaded bytes), 409 FILE_NOT_STORED when the extraction has no
extraction_files row, and 404 for an unknown extraction.

Mirrors the pattern in test_reactions_from_stored.py: upload via
client_csrf to get a real extraction_id (bytes auto-stored), then hit the
stored-file-backed endpoint.
"""

from httpx import AsyncClient
from sqlalchemy import text

from app.services.db import AsyncSessionLocal
from tests.conftest import TEST_SESSION_COOKIE


async def test_render_svg_happy_path(
    client_csrf: AsyncClient, cdx_file_bytes: bytes
) -> None:
    """POST /api/extract stores the file; GET .../render.svg renders it and
    returns sanitized, faithful SVG markup."""
    upload_resp = await client_csrf.post(
        "/api/extract",
        files={"file": ("L-lactic-acid.cdx", cdx_file_bytes, "chemical/x-cdx")},
    )
    assert upload_resp.status_code == 200, upload_resp.text
    extraction_id = upload_resp.json()["extraction_id"]
    assert extraction_id is not None

    resp = await client_csrf.get(f"/api/extractions/{extraction_id}/render.svg")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("image/svg+xml")
    assert b"<svg" in resp.content
    assert b"<script" not in resp.content


async def test_render_svg_file_not_stored(client_csrf: AsyncClient) -> None:
    """Extraction exists but has no extraction_files row -> 409 FILE_NOT_STORED
    (legacy entries created before file storage; top-level `code`, mirroring
    the FileNotStoredError convention from /api/extractions/{id}/reactions)."""
    async with AsyncSessionLocal() as s:
        await s.execute(
            text("SELECT set_config('app.session_id', :sid, true)"),
            {"sid": TEST_SESSION_COOKIE},
        )
        eid = (
            await s.execute(
                text(
                    "INSERT INTO extractions (session_id, filename, file_size, format, "
                    "structure_count, extraction_time_ms, warnings) "
                    "VALUES (:sid, 'x.cdx', 1, 'cdx', 0, 0, '[]'::jsonb) RETURNING id"
                ),
                {"sid": TEST_SESSION_COOKIE},
            )
        ).scalar_one()
        await s.commit()

    resp = await client_csrf.get(f"/api/extractions/{eid}/render.svg")
    assert resp.status_code == 409, resp.text
    assert resp.json()["code"] == "FILE_NOT_STORED"


async def test_render_svg_unknown_extraction(client_csrf: AsyncClient) -> None:
    """GET for a non-existent extraction id -> 404."""
    resp = await client_csrf.get("/api/extractions/999999999/render.svg")
    assert resp.status_code == 404, resp.text


async def test_render_upload_happy_path(
    client_csrf: AsyncClient, cdx_file_bytes: bytes
) -> None:
    """POST /api/render.svg renders an uploaded file in-memory (nothing stored):
    sanitized SVG back, and Cache-Control: no-store so no intermediary caches
    a file we never persisted."""
    resp = await client_csrf.post(
        "/api/render.svg",
        files={"file": ("L-lactic-acid.cdx", cdx_file_bytes, "chemical/x-cdx")},
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("image/svg+xml")
    assert resp.headers["cache-control"] == "no-store"
    assert b"<svg" in resp.content
    assert b"<script" not in resp.content


async def test_render_upload_bad_format(client_csrf: AsyncClient) -> None:
    """A non-CDX/CDXML upload is rejected at the format gate (415)."""
    resp = await client_csrf.post(
        "/api/render.svg",
        files={"file": ("junk.cdx", b"not a chemdraw file", "chemical/x-cdx")},
    )
    assert resp.status_code == 415, resp.text
