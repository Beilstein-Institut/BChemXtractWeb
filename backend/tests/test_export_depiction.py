"""Depiction selection for image exports (POST /api/export).

The image formats (png/svg) honor ``ExportRequest.depiction``:
  - "cdk" (default) exports the stored ``svg`` column (fresh CDK layout)
  - "cdx" exports the stored ``svg_cdx`` column (original ChemDraw coords)

Contract under test: EXPORT MATCHES DISPLAY. The selected stored SVG is
served (svg format) or rasterized via cairosvg (png format); when the
requested layout is missing for a structure the other one is used — the
same fallback the frontend applies when rendering — and only when no
stored SVG exists at all does PNG fall back to the legacy CDK
SMILES-reparse pipeline.

JVM generators are mocked (same approach as test_export.py) so the suite
runs without a live JVM; cairosvg runs for real.
"""

import contextlib
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from app.services.export import _pick_depiction_svg, _rasterize_svg_sync
from tests.conftest import TEST_SESSION_COOKIE

# Two visually distinct, valid SVG documents so response bodies identify
# which stored layout was served. Shaped like sanitized CDK output
# (xmlns + viewBox, vector paths only, no <text>).
_SVG_CDK = (
    "<?xml version='1.0' encoding='UTF-8'?>"
    "<svg version='1.2' xmlns='http://www.w3.org/2000/svg'"
    " width='450px' height='450px' viewBox='0 0 4.6 3.3'>"
    "<g id='cdk-layout'><path d='M0 0 L4 3' stroke='#000'/></g></svg>"
)
_SVG_CDX = (
    "<?xml version='1.0' encoding='UTF-8'?>"
    "<svg version='1.2' xmlns='http://www.w3.org/2000/svg'"
    " width='450px' height='450px' viewBox='0 0 4.6 3.3'>"
    "<g id='cdx-layout'><path d='M0 3 L4 0' stroke='#000'/></g></svg>"
)

_MOCK_JVM_PNG = b"\x89PNG\r\n\x1a\nJVM-FALLBACK-MARKER"

_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _substance(**overrides) -> dict:
    base = {
        "id": 1,
        "inchi_key": "LFQSCWFLJHTTHZ-UHFFFAOYSA-N",
        "smiles": "CCO",
        "molecular_formula": "C2H6O",
        "inchi": "InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3",
        "iupac_name": "",
        "extended_smiles": "",
        "svg": _SVG_CDK,
        "svg_cdx": _SVG_CDX,
        "mdlv3000": "",
    }
    base.update(overrides)
    return base


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    """Cookie-authenticated + CSRF-bootstrapped client (no lifespan)."""
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"bcx_sid": TEST_SESSION_COOKIE},
    ) as ac:
        token = (await ac.get("/api/csrf-token")).json()["csrf_token"]
        ac.headers.update({"X-CSRF-Token": token})
        yield ac


def _patch_jvm_and_db(substance_list: list[dict]):
    """Patch the DB fetch and route JVM calls to a marker PNG.

    The marker bytes let tests distinguish the legacy CDK SMILES fallback
    from the cairosvg rasterization of a stored SVG.
    """

    @contextlib.asynccontextmanager
    async def _ctx():
        # label/timeout are wrapper-only kwargs -- absorb them so the fallback
        # never forwards them to the sync generator (which doesn't accept them).
        async def _fake_run_in_jvm_thread(
            fn, *args, label=None, timeout=None, **kwargs
        ):
            if fn.__name__ == "_generate_png_sync":
                return _MOCK_JVM_PNG
            return fn(*args, **kwargs)

        with (
            patch(
                "app.routers.export._fetch_substances",
                new=AsyncMock(return_value=substance_list),
            ),
            patch(
                "app.services.export.run_in_jvm_thread_abandonable",
                side_effect=_fake_run_in_jvm_thread,
            ),
        ):
            yield

    return _ctx()


# ---------------------------------------------------------------------------
# _pick_depiction_svg unit tests
# ---------------------------------------------------------------------------


def test_pick_cdx_prefers_svg_cdx() -> None:
    assert _pick_depiction_svg(_substance(), "cdx") == _SVG_CDX


def test_pick_cdk_prefers_svg() -> None:
    assert _pick_depiction_svg(_substance(), "cdk") == _SVG_CDK


def test_pick_cdx_falls_back_to_cdk_layout() -> None:
    # Display parity: the frontend renders `svg` when `svg_cdx` is missing.
    assert _pick_depiction_svg(_substance(svg_cdx=""), "cdx") == _SVG_CDK


def test_pick_cdk_falls_back_to_cdx_layout() -> None:
    assert _pick_depiction_svg(_substance(svg=""), "cdk") == _SVG_CDX


def test_pick_returns_empty_when_no_layout_stored() -> None:
    assert _pick_depiction_svg(_substance(svg="", svg_cdx=""), "cdx") == ""


# ---------------------------------------------------------------------------
# _rasterize_svg_sync unit tests (real cairosvg)
# ---------------------------------------------------------------------------


def test_rasterize_produces_png_bytes() -> None:
    png = _rasterize_svg_sync(_SVG_CDX)
    assert png.startswith(_PNG_MAGIC)


def test_rasterize_invalid_markup_returns_empty() -> None:
    # Contract: never raises — empty bytes signal the CDK fallback.
    assert _rasterize_svg_sync("not an svg <<<") == b""


def test_rasterize_empty_markup_returns_empty() -> None:
    assert _rasterize_svg_sync("") == b""


# ---------------------------------------------------------------------------
# SVG export endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_svg_export_cdx_serves_chemdraw_layout(client: AsyncClient) -> None:
    async with _patch_jvm_and_db([_substance()]):
        resp = await client.post(
            "/api/export",
            json={"format": "svg", "substance_ids": [1], "depiction": "cdx"},
        )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/svg+xml")
    assert resp.content == _SVG_CDX.encode("utf-8")


@pytest.mark.asyncio
async def test_svg_export_defaults_to_cdk_layout(client: AsyncClient) -> None:
    # Back-compat: requests without `depiction` keep the historical output.
    async with _patch_jvm_and_db([_substance()]):
        resp = await client.post(
            "/api/export", json={"format": "svg", "substance_ids": [1]}
        )
    assert resp.status_code == 200
    assert resp.content == _SVG_CDK.encode("utf-8")


@pytest.mark.asyncio
async def test_svg_export_cdx_falls_back_per_structure(client: AsyncClient) -> None:
    async with _patch_jvm_and_db([_substance(svg_cdx="")]):
        resp = await client.post(
            "/api/export",
            json={"format": "svg", "substance_ids": [1], "depiction": "cdx"},
        )
    assert resp.status_code == 200
    assert resp.content == _SVG_CDK.encode("utf-8")


# ---------------------------------------------------------------------------
# PNG export endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_png_export_rasterizes_selected_depiction(client: AsyncClient) -> None:
    async with _patch_jvm_and_db([_substance()]):
        resp = await client.post(
            "/api/export",
            json={"format": "png", "substance_ids": [1], "depiction": "cdx"},
        )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/png")
    assert resp.content.startswith(_PNG_MAGIC)
    # Rasterized from the stored SVG — NOT the legacy JVM fallback.
    assert resp.content != _MOCK_JVM_PNG


@pytest.mark.asyncio
async def test_png_export_falls_back_to_cdk_pipeline(client: AsyncClient) -> None:
    # No stored SVG in either layout -> legacy SMILES-based CDK pipeline.
    async with _patch_jvm_and_db([_substance(svg="", svg_cdx="")]):
        resp = await client.post(
            "/api/export",
            json={"format": "png", "substance_ids": [1], "depiction": "cdx"},
        )
    assert resp.status_code == 200
    assert resp.content == _MOCK_JVM_PNG


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invalid_depiction_rejected(client: AsyncClient) -> None:
    async with _patch_jvm_and_db([_substance()]):
        resp = await client.post(
            "/api/export",
            json={"format": "svg", "substance_ids": [1], "depiction": "chemdraw"},
        )
    assert resp.status_code == 422
