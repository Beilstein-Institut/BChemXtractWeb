"""Deterministic small-molecule corpus for search tests (Phase 9).

Used by test_search_substructure.py, test_search_smiles.py, and
test_canonicalize.py. Each entry provides a known InChI key so
ORM upsert tests are reproducible.
"""

from __future__ import annotations

import pytest

KNOWN_MOLECULES: list[dict] = [
    # (id, name, smiles, canonical_smiles, molecular_formula, inchi_key)
    {
        "id": 1,
        "name": "benzene",
        "smiles": "c1ccccc1",
        "canonical_smiles": "c1ccccc1",
        "molecular_formula": "C6H6",
        "inchi_key": "UHOVQNZJYSORNB-UHFFFAOYSA-N",
    },
    {
        "id": 2,
        "name": "naphthalene",
        "smiles": "c1ccc2ccccc2c1",
        "canonical_smiles": "c1ccc2ccccc2c1",
        "molecular_formula": "C10H8",
        "inchi_key": "UFWIBTONFRDIAS-UHFFFAOYSA-N",
    },
    {
        "id": 3,
        "name": "hexane",
        "smiles": "CCCCCC",
        "canonical_smiles": "CCCCCC",
        "molecular_formula": "C6H14",
        "inchi_key": "VLKZOEOYAKHREP-UHFFFAOYSA-N",
    },
    {
        "id": 4,
        "name": "toluene",
        "smiles": "Cc1ccccc1",
        "canonical_smiles": "Cc1ccccc1",
        "molecular_formula": "C7H8",
        "inchi_key": "YXFVVABEGXRONW-UHFFFAOYSA-N",
    },
    {
        "id": 5,
        "name": "glucose",
        "smiles": "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O",
        "canonical_smiles": "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O",
        "molecular_formula": "C6H12O6",
        "inchi_key": "WQZGKKKJIJFFOK-GASJEMHNSA-N",
    },
]


@pytest.fixture
def known_molecules() -> list[dict]:
    """Return a fresh copy of the corpus so tests can mutate safely."""
    return [dict(m) for m in KNOWN_MOLECULES]
