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
    _MAX_INCHI_SMILES_LEN,
    _has_inchi_oversized_molecule,
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


# --- xtractUnique skip guard (the fix for the reported "big molecule never
# renders + upload takes forever" bug) --------------------------------------
# _has_inchi_oversized_molecule decides whether to SKIP the whole-document
# xtractUnique attempt. xtractUnique computes InChI internally and hangs
# uninterruptibly on an oversized molecule; the abandoned daemon it leaves
# behind accumulates across uploads until the JVM OOMs and the big molecule's
# SVG render silently fails. Skipping it when we already know a molecule is
# oversized is safe: such files always fell through to the fragment path anyway.


def test_oversized_guard_true_for_the_reported_cage() -> None:
    subs = [
        {"molecular_formula": "C14H16N2", "smiles": "NCc1ccc(-c2ccc(CN)cc2)cc1"},
        {"molecular_formula": "C132H174B6N6O12Si6", "smiles": "C" * 394},
    ]
    assert _has_inchi_oversized_molecule(subs) is True


def test_oversized_guard_false_for_all_normal_molecules() -> None:
    # The 3 small molecules from the reported file — xtractUnique should still
    # run for a file like this (no behavior change for normal files).
    subs = [
        {"molecular_formula": "C14H16N2", "smiles": "NCc1ccc(-c2ccc(CN)cc2)cc1"},
        {"molecular_formula": "C8H20O2Si", "smiles": "CC(C)(C)[Si](O)(O)C(C)(C)C"},
        {"molecular_formula": "C7H7BO3", "smiles": "OB(O)c1ccc(C=O)cc1"},
    ]
    assert _has_inchi_oversized_molecule(subs) is False


def test_oversized_guard_uses_smiles_len_when_formula_missing() -> None:
    # No formula → fall back to the SMILES-length cap (a polymer/cage with no
    # parseable formula must still be caught).
    assert (
        _has_inchi_oversized_molecule(
            [{"molecular_formula": "", "smiles": "C" * (_MAX_INCHI_SMILES_LEN + 1)}]
        )
        is True
    )
    assert (
        _has_inchi_oversized_molecule([{"molecular_formula": "", "smiles": "C" * 10}])
        is False
    )


def test_oversized_guard_ignores_substances_without_smiles() -> None:
    # An empty list, or entries with no SMILES, are never "oversized".
    assert _has_inchi_oversized_molecule([]) is False
    assert (
        _has_inchi_oversized_molecule([{"molecular_formula": "C999", "smiles": ""}])
        is False
    )
