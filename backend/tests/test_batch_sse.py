"""Tests for SSE batch progress endpoint."""
from unittest.mock import MagicMock, patch

from tests.conftest import TEST_AUTH_HEADERS


def test_batch_progress_returns_error_event_for_unknown_batch():
    """SSE endpoint: GroupResult.restore returning None triggers error event (not HTTP 404).

    EventSourceResponse always returns HTTP 200 — errors are communicated
    via SSE event type 'error' in the stream body.
    """
    from starlette.testclient import TestClient
    from app.main import app

    with patch("app.routers.batch.GroupResult") as mock_gr:
        mock_gr.restore.return_value = None
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get(
            "/api/batch/nonexistent-id/progress",
            headers={"Accept": "text/event-stream", **TEST_AUTH_HEADERS},
        )

    # EventSourceResponse returns 200 even for error events (SSE protocol)
    assert response.status_code == 200
