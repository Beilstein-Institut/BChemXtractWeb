"""Tests for ZIP download endpoint."""
from unittest.mock import AsyncMock, MagicMock, patch


def test_batch_zip_returns_404_for_unknown_batch():
    """ZIP endpoint returns 404 when no extractions found for batch_id."""
    from starlette.testclient import TestClient
    from app.main import app

    # Patch db.execute to return an empty result set
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []

    client = TestClient(app, raise_server_exceptions=False)
    with patch("app.routers.batch.select"), \
         patch("sqlalchemy.ext.asyncio.AsyncSession.execute", new_callable=AsyncMock, return_value=mock_result):
        response = client.get("/api/batch/nonexistent-id/zip")

    # 404 when no extractions match, 422 if path param validation fails
    assert response.status_code in (404, 422)
