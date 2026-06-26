"""Tests for the SSE batch progress endpoint (ownership + error path)."""

from unittest.mock import patch

from starlette.testclient import TestClient

from app.main import app
from app.routers import batch as batch_mod
from app.services import job_ownership as jo
from tests.conftest import TEST_SESSION_COOKIE


class _FakeOwnerStore:
    """In-memory stand-in for the Redis batch-owner records."""

    def __init__(self, initial: dict[str, bytes] | None = None) -> None:
        self._d: dict[str, bytes] = dict(initial or {})

    def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._d[key] = value.encode() if isinstance(value, str) else value

    def get(self, key: str) -> bytes | None:
        return self._d.get(key)


def test_batch_progress_unknown_batch_returns_404():
    """An unrecorded group_id is rejected with 404 before the stream opens.

    The SSE/cancel endpoints bypass RLS, so the ownership gate must run first
    and report unknown/foreign batches identically (no existence oracle).
    """
    store = _FakeOwnerStore()
    with patch.object(jo, "owner_store", lambda: store):
        client = TestClient(app, raise_server_exceptions=False)
        client.cookies.set("bcx_sid", TEST_SESSION_COOKIE)
        response = client.get(
            "/api/batch/nonexistent-id/progress",
            headers={"Accept": "text/event-stream"},
        )

    assert response.status_code == 404


def test_batch_progress_owned_missing_groupresult_emits_error_event():
    """For a batch the caller OWNS whose GroupResult is gone from Redis (e.g.
    results expired), the stream opens (HTTP 200) and emits an SSE 'error'
    event rather than failing the request — the original in-stream error path.
    """
    store = _FakeOwnerStore(
        {jo.job_owner_key("owned-id"): f"sid:{TEST_SESSION_COOKIE}".encode()}
    )
    with (
        patch.object(jo, "owner_store", lambda: store),
        patch.object(batch_mod, "GroupResult") as mock_gr,
    ):
        mock_gr.restore.return_value = None
        client = TestClient(app, raise_server_exceptions=False)
        client.cookies.set("bcx_sid", TEST_SESSION_COOKIE)
        response = client.get(
            "/api/batch/owned-id/progress",
            headers={"Accept": "text/event-stream"},
        )

    # EventSourceResponse returns 200; the missing GroupResult surfaces as an
    # SSE error event in the body.
    assert response.status_code == 200
    assert "Batch not found" in response.text
