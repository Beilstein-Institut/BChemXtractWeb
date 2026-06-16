"""Tests for the PubChem cache model + enrichment service."""

import pytest
import pytest_asyncio
from sqlalchemy import delete

from app.models.chemistry import PubChemEnrichItem
from app.models.orm import Base, PubChemCompound
from app.services import pubchem_enrich


@pytest_asyncio.fixture(autouse=True)
async def _clear_pubchem_cache(db_session):
    """Each test starts with an empty cache table. The service commits rows
    (db_session only rolls back uncommitted work), so without this prior
    tests' committed rows would leak and make assertions order-dependent."""
    await db_session.execute(delete(PubChemCompound))
    await db_session.commit()
    yield


def test_pubchem_compound_table_registered():
    """The cache table is in Base.metadata so Alembic + tests see it."""
    assert "pubchem_compounds" in Base.metadata.tables
    cols = Base.metadata.tables["pubchem_compounds"].columns
    assert "inchi_key" in cols
    assert "status" in cols
    assert "cid" in cols
    assert "synonyms" in cols
    assert "fetched_at" in cols
    # Public reference data — must NOT carry per-session ownership columns.
    assert "session_id" not in cols
    assert "api_key_hash" not in cols


def test_pubchem_compound_inchi_key_is_primary_key():
    pk = [c.name for c in PubChemCompound.__table__.primary_key.columns]
    assert pk == ["inchi_key"]


@pytest.mark.asyncio
async def test_enrich_batch_exact_caches_and_returns(db_session, monkeypatch):
    async def fake_exact(inchi_key, client=None):
        return [241]

    async def fake_conn(smiles, client=None):
        return []

    async def fake_props(cid, client=None):
        return {
            "molecular_formula": "C6H6",
            "molecular_weight": 78.11,
            "canonical_smiles": "C1=CC=CC=C1",
            "isomeric_smiles": "C1=CC=CC=C1",
            "iupac_name": "benzene",
            "xlogp": 2.1,
        }

    monkeypatch.setattr(pubchem_enrich.pubchem, "resolve_exact_cids", fake_exact)
    monkeypatch.setattr(pubchem_enrich.pubchem, "resolve_connectivity_cids", fake_conn)
    monkeypatch.setattr(pubchem_enrich.pubchem, "fetch_core_properties", fake_props)

    items = [
        PubChemEnrichItem(inchi_key="UHOVQNZJYSORNB-UHFFFAOYSA-N", smiles="c1ccccc1")
    ]
    out = await pubchem_enrich.enrich_batch(db_session, items)
    e = out["UHOVQNZJYSORNB-UHFFFAOYSA-N"]
    assert e.status == "exact"
    assert e.cid == 241
    assert e.molecular_formula == "C6H6"
    assert e.pubchem_url == "https://pubchem.ncbi.nlm.nih.gov/compound/241"

    # Second call must NOT hit the network — flip the stub to assert cache use.
    async def boom(*a, **k):
        raise AssertionError("network hit on cache hit")

    monkeypatch.setattr(pubchem_enrich.pubchem, "resolve_exact_cids", boom)
    out2 = await pubchem_enrich.enrich_batch(db_session, items)
    assert out2["UHOVQNZJYSORNB-UHFFFAOYSA-N"].cid == 241


@pytest.mark.asyncio
async def test_enrich_batch_scaffold_fallback(db_session, monkeypatch):
    async def fake_exact(inchi_key, client=None):
        return []

    async def fake_conn(smiles, client=None):
        return [12, 931]

    async def fake_props(cid, client=None):
        return {"molecular_formula": "C6H6", "iupac_name": "benzene"}

    monkeypatch.setattr(pubchem_enrich.pubchem, "resolve_exact_cids", fake_exact)
    monkeypatch.setattr(pubchem_enrich.pubchem, "resolve_connectivity_cids", fake_conn)
    monkeypatch.setattr(pubchem_enrich.pubchem, "fetch_core_properties", fake_props)

    items = [
        PubChemEnrichItem(inchi_key="SCAFFOLDKEY1XX-AAAAAAAAAA-N", smiles="c1ccccc1")
    ]
    out = await pubchem_enrich.enrich_batch(db_session, items)
    e = out["SCAFFOLDKEY1XX-AAAAAAAAAA-N"]
    assert e.status == "scaffold"
    assert e.cid == 12
    assert e.connectivity_cid_count == 2


@pytest.mark.asyncio
async def test_enrich_batch_absent(db_session, monkeypatch):
    async def empty(*a, **k):
        return []

    monkeypatch.setattr(pubchem_enrich.pubchem, "resolve_exact_cids", empty)
    monkeypatch.setattr(pubchem_enrich.pubchem, "resolve_connectivity_cids", empty)

    items = [PubChemEnrichItem(inchi_key="ABSENTKEY12345-AAAAAAAAAA-N", smiles="C")]
    out = await pubchem_enrich.enrich_batch(db_session, items)
    e = out["ABSENTKEY12345-AAAAAAAAAA-N"]
    assert e.status == "absent"
    assert e.cid is None
    assert e.pubchem_url is None


@pytest.mark.asyncio
async def test_enrich_detail_fills_tier2(db_session, monkeypatch):
    async def fake_exact(inchi_key, client=None):
        return [241]

    async def fake_props(cid, client=None):
        return {"molecular_formula": "C6H6", "iupac_name": "benzene"}

    async def fake_syn(cid, client=None):
        return ["benzene", "benzol"]

    async def fake_desc(cid, client=None):
        return {
            "title": "Benzene",
            "description": "An aromatic hydrocarbon.",
            "description_source": "NCIt",
        }

    async def no_conn(*a, **k):
        return []

    monkeypatch.setattr(pubchem_enrich.pubchem, "resolve_exact_cids", fake_exact)
    monkeypatch.setattr(pubchem_enrich.pubchem, "resolve_connectivity_cids", no_conn)
    monkeypatch.setattr(pubchem_enrich.pubchem, "fetch_core_properties", fake_props)
    monkeypatch.setattr(pubchem_enrich.pubchem, "fetch_synonyms", fake_syn)
    monkeypatch.setattr(pubchem_enrich.pubchem, "fetch_description", fake_desc)

    key = "UHOVQNZJYSORNB-UHFFFAOYSA-N"
    await pubchem_enrich.enrich_batch(
        db_session, [PubChemEnrichItem(inchi_key=key, smiles="c1ccccc1")]
    )
    detail = await pubchem_enrich.enrich_detail(db_session, key)
    assert detail.title == "Benzene"
    assert detail.synonyms == ["benzene", "benzol"]
    assert detail.description_source == "NCIt"


@pytest.mark.asyncio
async def test_enrich_batch_serves_stale_row_on_pubchem_error(db_session, monkeypatch):
    """A stale cache row + PubChem error must degrade to the stale data, not
    crash. Regression for the rollback-then-read MissingGreenlet bug."""
    from datetime import UTC, datetime

    key = "STALEKEY12345X-AAAAAAAAAA-N"
    db_session.add(
        PubChemCompound(
            inchi_key=key,
            status="exact",
            cid=241,
            molecular_formula="C6H6",
            fetched_at=datetime(2000, 1, 1, tzinfo=UTC),  # well past any TTL
        )
    )
    await db_session.commit()

    async def boom_exact(inchi_key, client=None):
        raise pubchem_enrich.pubchem.PubChemError("down")

    monkeypatch.setattr(pubchem_enrich.pubchem, "resolve_exact_cids", boom_exact)
    out = await pubchem_enrich.enrich_batch(
        db_session, [PubChemEnrichItem(inchi_key=key, smiles="c1ccccc1")]
    )
    e = out[key]
    assert e.status == "exact"
    assert e.cid == 241  # stale data served, no crash


@pytest.mark.asyncio
async def test_enrich_detail_serves_tier1_on_pubchem_error(db_session, monkeypatch):
    """A tier-2 fetch failure must serve the existing tier-1 row, not crash.
    Regression for the rollback-then-read MissingGreenlet bug."""
    from datetime import UTC, datetime

    key = "DETAILKEY1234X-AAAAAAAAAA-N"
    db_session.add(
        PubChemCompound(
            inchi_key=key,
            status="exact",
            cid=241,
            molecular_formula="C6H6",
            fetched_at=datetime.now(UTC),  # tier-1 fresh; detail not yet fetched
        )
    )
    await db_session.commit()

    async def boom(*a, **k):
        raise pubchem_enrich.pubchem.PubChemError("down")

    monkeypatch.setattr(pubchem_enrich.pubchem, "fetch_synonyms", boom)
    monkeypatch.setattr(pubchem_enrich.pubchem, "fetch_description", boom)
    detail = await pubchem_enrich.enrich_detail(db_session, key)
    assert detail.cid == 241  # tier-1 served, no crash
    assert detail.title is None
