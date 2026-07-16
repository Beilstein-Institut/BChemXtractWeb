"""Tests for POST /api/extractions/{id}/reactions -- reactions from a prior
extraction's stored file (no re-upload).

Covers: success (real JVM round-trip through /api/reactions, which now
stores bytes on the reactions-first path), 409 FILE_NOT_STORED when the
extraction has no extraction_files row, and 404 for an unknown extraction.

RLS enforcement: the unit-test DB connects as a Postgres superuser, which
bypasses RLS even with FORCE ROW LEVEL SECURITY (see conftest.py). A test
asserting a real cross-session 404 would pass vacuously here for the wrong
reason, so the isolation test below is marked
``skip_under_superuser_db`` -- same convention as test_session_isolation.py.
It documents intent and runs for real against the NOSUPERUSER app role
(docker-compose / Playwright e2e); under the unit suite's superuser role it
is skipped rather than asserted falsely.
"""

from httpx import AsyncClient
from sqlalchemy import text

from app.services.db import AsyncSessionLocal
from tests.conftest import TEST_SESSION_COOKIE, skip_under_superuser_db


async def test_extract_from_stored_returns_reactions(
    client_csrf: AsyncClient, cdx_reaction_file_bytes: bytes
) -> None:
    """POST /api/reactions stores the file (Step 5); POST
    /api/extractions/{id}/reactions then re-derives reactions from those
    stored bytes and gets the same reaction_count back."""
    upload_resp = await client_csrf.post(
        "/api/reactions",
        files={
            "file": ("simple_reaction.cdx", cdx_reaction_file_bytes, "chemical/x-cdx")
        },
    )
    assert upload_resp.status_code == 200, upload_resp.text
    upload_data = upload_resp.json()
    extraction_id = upload_data["extraction_id"]
    expected_count = upload_data["reaction_count"]
    assert extraction_id is not None
    assert expected_count >= 1

    resp = await client_csrf.post(f"/api/extractions/{extraction_id}/reactions")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["extraction_id"] == extraction_id
    assert data["reaction_count"] == expected_count
    assert len(data["reactions"]) == expected_count
    assert data["format"] == "cdx"
    assert data["filename"] == "simple_reaction.cdx"


async def test_extract_from_stored_missing_file_returns_409(
    client_csrf: AsyncClient,
) -> None:
    """Extraction exists but has no extraction_files row -> 409 FILE_NOT_STORED
    (legacy entries created before file storage)."""
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

    resp = await client_csrf.post(f"/api/extractions/{eid}/reactions")
    assert resp.status_code == 409, resp.text
    assert resp.json()["code"] == "FILE_NOT_STORED"


async def test_extract_from_stored_unknown_extraction_returns_404(
    client_csrf: AsyncClient,
) -> None:
    """POST for a non-existent extraction id -> 404."""
    resp = await client_csrf.post("/api/extractions/999999999/reactions")
    assert resp.status_code == 404, resp.text


@skip_under_superuser_db
async def test_extract_from_stored_cross_session_returns_404(
    client_csrf: AsyncClient,
) -> None:
    """An extraction + stored file owned by session A is invisible to session B --
    POST /api/extractions/{id}/reactions as B returns 404 (get_extraction_reactions
    scopes the lookup via RLS, so B's request never resolves A's row).

    Skipped under the unit suite's superuser DB role (bypasses RLS -- see
    module docstring); runs for real against the NOSUPERUSER app role.
    """
    sid_a = "33333333-3333-4333-8333-333333333333"
    async with AsyncSessionLocal() as s:
        await s.execute(
            text("SELECT set_config('app.session_id', :sid, true)"), {"sid": sid_a}
        )
        eid = (
            await s.execute(
                text(
                    "INSERT INTO extractions (session_id, filename, file_size, format, "
                    "structure_count, extraction_time_ms, warnings) "
                    "VALUES (:sid, 'a-owned.cdx', 4, 'cdx', 0, 0, '[]'::jsonb) "
                    "RETURNING id"
                ),
                {"sid": sid_a},
            )
        ).scalar_one()
        await s.execute(
            text(
                "INSERT INTO extraction_files (extraction_id, content, session_id) "
                "VALUES (:eid, :content, :sid)"
            ),
            {"eid": eid, "content": b"VjCD-fake-bytes", "sid": sid_a},
        )
        await s.commit()

    # client_csrf authenticates as TEST_SESSION_COOKIE (session B) -- a
    # different session than sid_a.
    resp = await client_csrf.post(f"/api/extractions/{eid}/reactions")
    assert resp.status_code == 404, resp.text
