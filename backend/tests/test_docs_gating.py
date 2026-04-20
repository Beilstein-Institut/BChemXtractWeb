"""OpenAPI-surface gating tests (C-02 / information disclosure hardening).

When :attr:`Settings.expose_openapi_docs` is falsy, the application must
refuse to serve ``/docs``, ``/redoc``, and ``/openapi.json``. When truthy,
all three are available.

The existing suite runs with ``EXPOSE_OPENAPI_DOCS=true`` via
``conftest.py``, so we construct a second app instance with the flag
flipped off to exercise the suppressed path.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

pytestmark = pytest.mark.asyncio


async def test_docs_available_when_exposed(client_no_jvm: AsyncClient) -> None:
    # The `client_no_jvm` fixture authenticates; /docs is not auth-gated.
    r = await client_no_jvm.get("/docs")
    assert r.status_code == 200
    assert "swagger" in r.text.lower() or "openapi" in r.text.lower()


async def test_openapi_json_available_when_exposed(
    client_no_jvm: AsyncClient,
) -> None:
    r = await client_no_jvm.get("/openapi.json")
    assert r.status_code == 200
    assert r.json()["info"]["title"] == "BChemXtract Web API"


async def test_redoc_available_when_exposed(
    client_no_jvm: AsyncClient,
) -> None:
    r = await client_no_jvm.get("/redoc")
    assert r.status_code == 200
    assert "redoc" in r.text.lower()


async def test_docs_suppressed_when_expose_flag_false(monkeypatch) -> None:
    """With ``EXPOSE_OPENAPI_DOCS=false``, ``/docs`` / ``/redoc`` /
    ``/openapi.json`` must 404."""
    from app.config import settings  # noqa: PLC0415
    from app.main import create_app  # noqa: PLC0415

    monkeypatch.setattr(settings, "expose_openapi_docs", False)
    suppressed_app = create_app()

    transport = ASGITransport(app=suppressed_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        for path in ("/docs", "/redoc", "/openapi.json"):
            r = await ac.get(path)
            assert r.status_code == 404, (
                f"{path} must 404 when expose_openapi_docs=False, "
                f"got {r.status_code}"
            )
