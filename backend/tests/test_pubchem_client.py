"""PubChem client tests — httpx.MockTransport, no live network."""

import httpx
import pytest

from app.services import pubchem


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://pubchem.ncbi.nlm.nih.gov/rest/pug",
    )


@pytest.mark.asyncio
async def test_resolve_exact_cids_returns_sorted_cids():
    def handler(request: httpx.Request) -> httpx.Response:
        assert "/compound/inchikey/UHOVQNZJYSORNB-UHFFFAOYSA-N/cids/JSON" in str(
            request.url
        )
        return httpx.Response(200, json={"IdentifierList": {"CID": [241, 7]}})

    async with _client(handler) as c:
        cids = await pubchem.resolve_exact_cids("UHOVQNZJYSORNB-UHFFFAOYSA-N", client=c)
    assert cids == [7, 241]


@pytest.mark.asyncio
async def test_resolve_exact_cids_404_returns_empty():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"Fault": {"Code": "PUGREST.NotFound"}})

    async with _client(handler) as c:
        cids = await pubchem.resolve_exact_cids("ZZZZZZZZZZZZZZ-AAAAAAAAAA-N", client=c)
    assert cids == []


@pytest.mark.asyncio
async def test_resolve_connectivity_cids_posts_smiles():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = request.content.decode()
        return httpx.Response(200, json={"IdentifierList": {"CID": [931, 12]}})

    async with _client(handler) as c:
        cids = await pubchem.resolve_connectivity_cids("c1ccccc1", client=c)
    assert "fastidentity/smiles/cids/JSON" in seen["url"]
    assert "identity_type=same_connectivity" in seen["url"]
    assert "smiles=c1ccccc1" in seen["body"]
    assert cids == [12, 931]


@pytest.mark.asyncio
async def test_fetch_core_properties_maps_fields():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "PropertyTable": {
                    "Properties": [
                        {
                            "CID": 241,
                            "MolecularFormula": "C6H6",
                            "MolecularWeight": "78.11",
                            "CanonicalSMILES": "C1=CC=CC=C1",
                            "IsomericSMILES": "C1=CC=CC=C1",
                            "IUPACName": "benzene",
                            "XLogP": 2.1,
                        }
                    ]
                }
            },
        )

    async with _client(handler) as c:
        props = await pubchem.fetch_core_properties(241, client=c)
    assert props["molecular_formula"] == "C6H6"
    assert props["molecular_weight"] == 78.11
    assert props["iupac_name"] == "benzene"
    assert props["xlogp"] == 2.1


@pytest.mark.asyncio
async def test_503_retries_then_raises(monkeypatch):
    calls = {"n": 0}

    async def no_sleep(_):
        return None

    # Patch the module's asyncio.sleep so the backoff burns no real time.
    monkeypatch.setattr(pubchem.asyncio, "sleep", no_sleep)

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503, text="Too many requests or server too busy")

    async with _client(handler) as c:
        with pytest.raises(pubchem.PubChemError):
            await pubchem.resolve_exact_cids("AAAAAAAAAAAAAA-AAAAAAAAAA-N", client=c)
    # initial try + retries (PUBCHEM_MAX_RETRIES).
    assert calls["n"] == pubchem.PUBCHEM_MAX_RETRIES + 1
