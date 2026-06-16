"""Tests for the PubChem cache model + enrichment service."""

from app.models.orm import Base, PubChemCompound


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
