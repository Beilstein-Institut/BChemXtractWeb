"""Integration tests for POST /api/export endpoint.

Tests all six export formats plus input validation. JVM-dependent generators
(SDF, PNG, V3000) are mocked so the test suite runs without a live JVM.
Pure-Python generators (JSON, CSV, SVG) run unpatched.

Mock strategy:
  - _generate_sdf_sync: returns minimal valid SDF bytes (contains $$$$)
  - _generate_png_sync: returns minimal PNG header bytes (\\x89PNG...)
  - _generate_v3000_sync: returns minimal V3000 molfile bytes

The router's _fetch_substances() is patched to return TEST_SUBSTANCE_DICT
without requiring a live database connection.
"""

import io
import json
import zipfile
from unittest.mock import AsyncMock, patch

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from tests.conftest import TEST_SESSION_COOKIE

# ---------------------------------------------------------------------------
# Test fixture data
# ---------------------------------------------------------------------------

TEST_SUBSTANCE = {
    "id": 1,
    "inchi_key": "LFQSCWFLJHTTHZ-UHFFFAOYSA-N",
    "smiles": "CCO",
    "molecular_formula": "C2H6O",
    "inchi": "InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3",
    "iupac_name": "",
    "extended_smiles": "",
    "svg": "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'></svg>",
    "mdlv3000": "",
}

# Minimal SDF bytes — contains $$$$ record separator
_MOCK_SDF_BYTES = (
    b"\n  Mrv2211 01010000002D\n\n"
    b"  2  1  0  0  0  0            999 V2000\n"
    b"    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n"
    b"    1.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n"
    b"  1  2  1  0  0  0  0\n"
    b"M  END\n$$$$\n"
)

# Minimal valid PNG header (8-byte PNG signature + IHDR)
_MOCK_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x01\xc2"  # width=450
    b"\x00\x00\x01\xc2"  # height=450
    b"\x08\x02\x00\x00\x00"
    b"\xd3\x2b\x5a\x47"
)

# Minimal V3000 molfile
_MOCK_V3000_BYTES = (
    b"\n     RDKit          2D\n\n"
    b"  0  0  0  0  0  0  0  0  0  0999 V3000\n"
    b"M  V30 BEGIN CTAB\n"
    b"M  V30 COUNTS 2 1 0 0 0\n"
    b"M  V30 BEGIN ATOM\n"
    b"M  V30 1 C 0 0 0 0\n"
    b"M  V30 2 O 1 0 0 0\n"
    b"M  V30 END ATOM\n"
    b"M  V30 BEGIN BOND\n"
    b"M  V30 1 1 1 2\n"
    b"M  V30 END BOND\n"
    b"M  V30 END CTAB\nM  END\n"
)


# ---------------------------------------------------------------------------
# App fixture (no lifespan — avoids JVM startup in unit tests)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    """Cookie-authenticated HTTP client connected to the app without lifespan.

    The export router is registered and the DB dependency is overridden so
    _fetch_substances() never actually hits the database. The ``bcx_sid``
    cookie is attached so ``get_scoped_db`` finds a valid session before
    yielding the DB to the route handler.
    """
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"bcx_sid": TEST_SESSION_COOKIE},
    ) as ac:
        yield ac


# ---------------------------------------------------------------------------
# Helper: patch all JVM generators + DB fetch
# ---------------------------------------------------------------------------


def _patch_jvm_and_db(substance_list: list[dict] | None = None):
    """Return a context manager that patches:
    - _generate_sdf_sync -> returns _MOCK_SDF_BYTES
    - _generate_png_sync -> returns _MOCK_PNG_BYTES
    - _generate_v3000_sync -> returns _MOCK_V3000_BYTES
    - run_in_jvm_thread -> calls the sync fn directly (bypasses thread pool)
    - _fetch_substances -> returns substance_list (default: [TEST_SUBSTANCE])
    """
    from unittest.mock import patch

    subs = substance_list if substance_list is not None else [TEST_SUBSTANCE]

    import contextlib

    @contextlib.asynccontextmanager
    async def _ctx():
        async def _fake_run_in_jvm_thread(fn, *args, **kwargs):
            # Map each sync generator to its mock output
            if fn.__name__ == "_generate_sdf_sync":
                return _MOCK_SDF_BYTES
            if fn.__name__ == "_generate_png_sync":
                return _MOCK_PNG_BYTES
            if fn.__name__ == "_generate_v3000_sync":
                return _MOCK_V3000_BYTES
            # Fallback: call fn directly
            return fn(*args, **kwargs)

        with (
            patch(
                "app.routers.export._fetch_substances",
                new=AsyncMock(return_value=subs),
            ),
            patch(
                "app.services.export.run_in_jvm_thread",
                side_effect=_fake_run_in_jvm_thread,
            ),
        ):
            yield

    return _ctx()


# ---------------------------------------------------------------------------
# Format tests
# ---------------------------------------------------------------------------


async def test_sdf_export(client: AsyncClient) -> None:
    """POST /api/export format=sdf returns chemical/x-mdl-sdfile with $$$$ separator."""
    async with _patch_jvm_and_db():
        resp = await client.post(
            "/api/export",
            json={"format": "sdf", "substance_ids": [1]},
        )

    assert resp.status_code == 200, resp.text
    assert "chemical/x-mdl-sdfile" in resp.headers["content-type"]
    assert b"$$$$" in resp.content


async def test_json_export(client: AsyncClient) -> None:
    """POST /api/export format=json returns application/json array with keys."""
    async with _patch_jvm_and_db():
        resp = await client.post(
            "/api/export",
            json={"format": "json", "substance_ids": [1]},
        )

    assert resp.status_code == 200, resp.text
    assert "application/json" in resp.headers["content-type"]
    data = json.loads(resp.content)
    assert isinstance(data, list)
    assert len(data) == 1
    row = data[0]
    for key in (
        "id",
        "inchi_key",
        "smiles",
        "molecular_formula",
        "inchi",
        "iupac_name",
        "extended_smiles",
    ):
        assert key in row, f"Missing key {key!r} in JSON export row"


async def test_csv_export(client: AsyncClient) -> None:
    """POST /api/export format=csv returns text/csv with correct header line."""
    async with _patch_jvm_and_db():
        resp = await client.post(
            "/api/export",
            json={"format": "csv", "substance_ids": [1]},
        )

    assert resp.status_code == 200, resp.text
    assert "text/csv" in resp.headers["content-type"]
    text = resp.content.decode("utf-8")
    first_line = text.splitlines()[0]
    assert (
        first_line
        == "id,inchi_key,smiles,molecular_formula,inchi,iupac_name,extended_smiles"
    )


async def test_svg_export_single_returns_svg(client: AsyncClient) -> None:
    """Single-substance SVG export returns raw SVG (not a ZIP).

    Mirrors the PNG/V3000 single-substance shortcut so the ``.svg``
    filename the browser saves actually contains SVG markup — otherwise
    the file is ZIP bytes and every SVG viewer reports
    "Document is empty" (the user-facing bug this test locks down).
    """
    async with _patch_jvm_and_db():
        resp = await client.post(
            "/api/export",
            json={"format": "svg", "substance_ids": [1]},
        )

    assert resp.status_code == 200, resp.text
    assert "image/svg+xml" in resp.headers["content-type"]
    assert resp.content.startswith(b"<svg"), (
        f"Expected SVG markup, got: {resp.content[:40]!r}"
    )
    disposition = resp.headers.get("content-disposition", "")
    assert ".svg" in disposition, f"Expected .svg filename, got: {disposition!r}"


async def test_svg_export_multi_returns_zip(client: AsyncClient) -> None:
    """Multi-substance SVG export returns a ZIP of .svg entries."""
    subs = [
        {**TEST_SUBSTANCE, "id": 1},
        {**TEST_SUBSTANCE, "id": 2, "inchi_key": "QTBSBXVTEAMEQO-UHFFFAOYSA-N"},
    ]
    async with _patch_jvm_and_db(substance_list=subs):
        resp = await client.post(
            "/api/export",
            json={"format": "svg", "substance_ids": [1, 2]},
        )

    assert resp.status_code == 200, resp.text
    assert "application/zip" in resp.headers["content-type"]
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        svg_names = [n for n in zf.namelist() if n.endswith(".svg")]
        assert len(svg_names) == 2, f"Expected 2 SVGs, got: {zf.namelist()}"
        svg_content = zf.read(svg_names[0])
        assert svg_content.startswith(b"<svg")


async def test_v3000_export(client: AsyncClient) -> None:
    """POST /api/export format=v3000 returns application/zip containing a .mol file."""
    async with _patch_jvm_and_db():
        resp = await client.post(
            "/api/export",
            json={"format": "v3000", "substance_ids": [1]},
        )

    assert resp.status_code == 200, resp.text
    # Single substance -> direct molfile (not ZIP)
    content_type = resp.headers["content-type"]
    assert "chemical/x-mdl-molfile" in content_type or "application/zip" in content_type


async def test_png_export(client: AsyncClient) -> None:
    """POST /api/export format=png returns image/png or application/zip."""
    async with _patch_jvm_and_db():
        resp = await client.post(
            "/api/export",
            json={"format": "png", "substance_ids": [1]},
        )

    assert resp.status_code == 200, resp.text
    content_type = resp.headers["content-type"]
    # Single substance -> direct PNG
    assert "image/png" in content_type or "application/zip" in content_type
    if "image/png" in content_type:
        assert resp.content.startswith(b"\x89PNG"), (
            f"PNG bytes do not start with PNG signature: {resp.content[:8]!r}"
        )
    else:
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            png_names = [n for n in zf.namelist() if n.endswith(".png")]
            assert len(png_names) >= 1, f"No .png files in ZIP. Names: {zf.namelist()}"
            png_bytes = zf.read(png_names[0])
            assert png_bytes.startswith(b"\x89PNG")


async def test_png_limit(client: AsyncClient) -> None:
    """POST /api/export format=png with 201 substance IDs returns HTTP 400."""
    # Build 201 dummy substances
    many_subs = [
        {
            **TEST_SUBSTANCE,
            "id": i,
            "inchi_key": f"AAAAAAAA{'A' * (17 - len(str(i)))}{i}-UHFFFAOYSA-N",
        }
        for i in range(1, 202)
    ]

    async with _patch_jvm_and_db(substance_list=many_subs):
        resp = await client.post(
            "/api/export",
            json={"format": "png", "substance_ids": list(range(1, 202))},
        )

    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
    assert "200" in resp.json()["detail"] or "limit" in resp.json()["detail"].lower()


async def test_unknown_format(client: AsyncClient) -> None:
    """POST /api/export with unknown format returns HTTP 422 (Pydantic validation)."""
    # No DB/JVM patching needed — Pydantic rejects it before handler runs
    resp = await client.post(
        "/api/export",
        json={"format": "xyz", "substance_ids": [1]},
    )
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_export_all_uses_extraction_id(client: AsyncClient) -> None:
    """POST /api/export extraction_id + empty substance_ids = fetch all."""
    fetched_args = {}

    async def _capture_fetch(payload, db):
        fetched_args["extraction_id"] = payload.extraction_id
        fetched_args["substance_ids"] = payload.substance_ids
        return [TEST_SUBSTANCE]

    with (
        patch("app.routers.export._fetch_substances", side_effect=_capture_fetch),
        patch(
            "app.services.export.run_in_jvm_thread",
            new=AsyncMock(return_value=_MOCK_SDF_BYTES),
        ),
    ):
        resp = await client.post(
            "/api/export",
            json={"format": "sdf", "extraction_id": 42, "substance_ids": []},
        )

    assert resp.status_code == 200, resp.text
    assert fetched_args.get("extraction_id") == 42
    assert fetched_args.get("substance_ids") == []
