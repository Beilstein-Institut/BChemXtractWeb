"""InChI-from-SMILES recovery guards (extractor fallback path).

When xtractUnique times out (one giant molecule is enough), the fragment path
has SMILES but no InChI. The recovery recomputes InChI per molecule from the
SMILES, but MUST skip molecules large enough to make InChI generation hang —
that is exactly the molecule that made xtractUnique time out, and a running
InChI call cannot be interrupted. These tests pin the size-cap logic (pure
Python; no JVM needed).
"""

from __future__ import annotations

from app.services.extractor import (
    _MAX_INCHI_HEAVY_ATOMS,
    _heavy_atom_count,
)


def test_heavy_atom_count_excludes_hydrogen() -> None:
    assert _heavy_atom_count("C6H6") == 6
    assert _heavy_atom_count("C14H16N2") == 16
    assert _heavy_atom_count("C8H20O2Si") == 11
    # The supramolecular cage from the reported file.
    assert _heavy_atom_count("C132H174B6N6O12Si6") == 162


def test_heavy_atom_count_handles_two_letter_elements_and_no_count() -> None:
    # Cl counts as one element; implicit count of 1 (no digit).
    assert _heavy_atom_count("CHCl3") == 4  # C + 3 Cl
    assert _heavy_atom_count("NaCl") == 2


def test_heavy_atom_count_empty_or_garbage() -> None:
    assert _heavy_atom_count("") == 0
    assert _heavy_atom_count("???") == 0


def test_cap_separates_normal_molecules_from_the_giant_cage() -> None:
    # The 3 normal molecules in the reported file are well under the cap; the
    # 162-atom cage is over it and must be skipped for InChI recovery.
    for formula in ("C14H16N2", "C8H20O2Si", "C7H7BO3"):
        assert _heavy_atom_count(formula) <= _MAX_INCHI_HEAVY_ATOMS
    assert _heavy_atom_count("C132H174B6N6O12Si6") > _MAX_INCHI_HEAVY_ATOMS
