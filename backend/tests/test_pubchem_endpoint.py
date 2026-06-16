"""Endpoint tests for /api/pubchem/*. The enrichment service is monkeypatched
so no network or DB-write coupling leaks into these tests."""

import pytest

from app.models.chemistry import PubChemEnrichment
from app.routers import pubchem as pubchem_router


@pytest.mark.asyncio
async def test_status_reports_enabled_flag(client_csrf, monkeypatch):
    """status answers truthfully regardless of the flag (never 503)."""
    monkeypatch.setattr(pubchem_router.settings, "pubchem_enabled", False)
    r = await client_csrf.get("/api/pubchem/status")
    assert r.status_code == 200
    assert r.json() == {"enabled": False}

    monkeypatch.setattr(pubchem_router.settings, "pubchem_enabled", True)
    r = await client_csrf.get("/api/pubchem/status")
    assert r.status_code == 200
    assert r.json() == {"enabled": True}


@pytest.mark.asyncio
async def test_enrich_disabled_returns_503(client_csrf, monkeypatch):
    monkeypatch.setattr(pubchem_router.settings, "pubchem_enabled", False)
    r = await client_csrf.post(
        "/api/pubchem/enrich",
        json={
            "items": [
                {"inchi_key": "UHOVQNZJYSORNB-UHFFFAOYSA-N", "smiles": "c1ccccc1"}
            ]
        },
    )
    assert r.status_code == 503
    assert r.json()["code"] == "PUBCHEM_DISABLED"


@pytest.mark.asyncio
async def test_enrich_happy_path(client_csrf, monkeypatch):
    monkeypatch.setattr(pubchem_router.settings, "pubchem_enabled", True)

    async def fake_batch(db, items):
        return {
            items[0].inchi_key: PubChemEnrichment(
                inchi_key=items[0].inchi_key, status="exact", cid=241
            )
        }

    monkeypatch.setattr(pubchem_router.pubchem_enrich, "enrich_batch", fake_batch)
    r = await client_csrf.post(
        "/api/pubchem/enrich",
        json={
            "items": [
                {"inchi_key": "UHOVQNZJYSORNB-UHFFFAOYSA-N", "smiles": "c1ccccc1"}
            ]
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["results"]["UHOVQNZJYSORNB-UHFFFAOYSA-N"]["cid"] == 241


@pytest.mark.asyncio
async def test_enrich_batch_cap_rejected(client_csrf, monkeypatch):
    monkeypatch.setattr(pubchem_router.settings, "pubchem_enabled", True)
    items = [{"inchi_key": "A" * 14, "smiles": "C"} for _ in range(51)]
    r = await client_csrf.post("/api/pubchem/enrich", json={"items": items})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_compound_detail(client_csrf, monkeypatch):
    monkeypatch.setattr(pubchem_router.settings, "pubchem_enabled", True)

    async def fake_detail(db, inchi_key):
        return PubChemEnrichment(
            inchi_key=inchi_key, status="exact", cid=241, title="Benzene"
        )

    monkeypatch.setattr(pubchem_router.pubchem_enrich, "enrich_detail", fake_detail)
    r = await client_csrf.get("/api/pubchem/compound/UHOVQNZJYSORNB-UHFFFAOYSA-N")
    assert r.status_code == 200
    assert r.json()["title"] == "Benzene"
