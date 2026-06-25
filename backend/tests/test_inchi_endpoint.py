"""POST /api/inchi — on-demand InChI compute for a SMILES."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_compute_inchi_for_benzene(client_csrf: AsyncClient) -> None:
    resp = await client_csrf.post("/api/inchi", json={"smiles": "c1ccccc1"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["inchi"].startswith("InChI=1S/C6H6")
    assert body["inchi_key"] == "UHOVQNZJYSORNB-UHFFFAOYSA-N"


async def test_compute_inchi_rejects_unparseable_smiles(
    client_csrf: AsyncClient,
) -> None:
    resp = await client_csrf.post("/api/inchi", json={"smiles": "not a smiles )((("})
    assert resp.status_code == 422, resp.text
    assert resp.json()["code"] == "INVALID_SMILES"


async def test_compute_inchi_requires_smiles(client_csrf: AsyncClient) -> None:
    resp = await client_csrf.post("/api/inchi", json={"smiles": ""})
    assert resp.status_code == 422, resp.text
