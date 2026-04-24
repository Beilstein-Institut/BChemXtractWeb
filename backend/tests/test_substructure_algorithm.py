"""End-to-end algorithm tests for enumerate_matches.

These tests exercise CDK through JPype — they require a running JVM
(the conftest.py session fixture handles this).
"""

from __future__ import annotations

import pytest

from app.services.jvm_bridge import run_in_jvm_thread
from app.services.substructure import (
    enumerate_matches,
    parse_query,
)


def _prepare_target(smiles: str):
    """Parse a SMILES into a target container with aromaticity applied."""
    import jpype

    SilentChemObjectBuilder = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.silent.SilentChemObjectBuilder"
    )
    SmilesParser = jpype.JClass("org.openscience.cdk.smiles.SmilesParser")  # noqa: N806
    AtomContainerManipulator = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.tools.manipulator.AtomContainerManipulator"
    )
    Aromaticity = jpype.JClass("org.openscience.cdk.aromaticity.Aromaticity")  # noqa: N806
    ElectronDonation = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.aromaticity.ElectronDonation"
    )
    Cycles = jpype.JClass("org.openscience.cdk.graph.Cycles")  # noqa: N806

    builder = SilentChemObjectBuilder.getInstance()
    mol = SmilesParser(builder).parseSmiles(smiles)
    AtomContainerManipulator.percieveAtomTypesAndConfigureAtoms(mol)
    Aromaticity(
        ElectronDonation.daylight(),
        Cycles.or_(Cycles.all(), Cycles.cdkAromaticSet()),
    ).apply(mol)
    return mol


def _run(query_raw: str, target_smiles: str, *, match_stereo: bool = False):
    def _work():
        parsed = parse_query(query_raw, match_stereo=match_stereo)
        target = _prepare_target(target_smiles)
        return enumerate_matches(parsed, target)

    return run_in_jvm_thread(_work)


class TestAllMatchesHighlighted:
    """Bug A regression: uniqueAtoms() used to drop overlapping matches."""

    @pytest.mark.asyncio
    async def test_benzene_in_naphthalene_covers_all_ten_atoms(self, started_app):
        """Naphthalene has TWO fused benzene rings; both must be highlighted."""
        result = await _run("c1ccccc1", "c1ccc2ccccc2c1")
        assert result.matched is True
        assert sorted(result.atom_indices) == list(range(10))
        # Naphthalene has 11 bonds (10 aromatic + 1 fusion).
        assert len(result.bond_indices) == 11

    @pytest.mark.asyncio
    async def test_cc_in_hexane_highlights_all_five_bonds(self, started_app):
        """Hexane CCCCCC has 5 overlapping C-C bonds — all must be marked."""
        result = await _run("CC", "CCCCCC")
        assert result.matched is True
        assert sorted(result.atom_indices) == [0, 1, 2, 3, 4, 5]
        assert len(result.bond_indices) == 5

    @pytest.mark.asyncio
    async def test_carbonyl_in_triketone(self, started_app):
        """Two C=O groups in 2,4-pentanedione — all highlighted."""
        result = await _run("C=O", "CC(=O)CC(=O)C")
        assert result.matched is True
        carbonyl_atoms = set(result.atom_indices)
        assert len(carbonyl_atoms) == 4


class TestBondOverHighlightRegression:
    """Bug B regression: atom-union bond derivation used to add stray bonds."""

    @pytest.mark.asyncio
    async def test_co_in_ethylene_glycol_does_not_mark_cc_bond(self, started_app):
        """Query CO in OCCO: atoms {0,1,2,3} covered by two mappings.
        The C-C bond (between atoms 1 and 2) was NOT part of any mapping
        and must NOT appear in bond_indices."""
        result = await _run("CO", "OCCO")
        assert result.matched is True
        atoms = sorted(result.atom_indices)
        bonds = sorted(result.bond_indices)
        assert len(atoms) == 4
        # OCCO has 3 bonds: O0-C1, C1-C2, C2-O3.
        # Only O0-C1 and C2-O3 are part of CO mappings. C1-C2 must NOT be.
        assert len(bonds) == 2


class TestSmartsFeatures:
    @pytest.mark.asyncio
    async def test_smarts_trigonal_carbon_matches_carbonyl(self, started_app):
        result = await _run("[CX3]=O", "CC(=O)C")
        assert result.matched is True
        assert len(result.atom_indices) == 2

    @pytest.mark.asyncio
    async def test_smarts_any_carbon_matches_all_in_benzene(self, started_app):
        result = await _run("[#6]", "c1ccccc1")
        assert result.matched is True
        assert sorted(result.atom_indices) == [0, 1, 2, 3, 4, 5]


class TestMappingCap:
    @pytest.mark.asyncio
    async def test_cap_hit_sets_partial_match_flag(self, started_app):
        def _work():
            parsed = parse_query("[#6]", match_stereo=False)
            target = _prepare_target("c1ccccc1")
            return enumerate_matches(parsed, target, cap=3)  # artificially low

        result = await run_in_jvm_thread(_work)
        assert result.matched is True
        assert result.partial_match is True
        assert result.mapping_count <= 3

    @pytest.mark.asyncio
    async def test_normal_query_has_partial_match_false(self, started_app):
        result = await _run("c1ccccc1", "c1ccccc1")
        assert result.partial_match is False


class TestNoMatch:
    @pytest.mark.asyncio
    async def test_no_match_returns_matched_false(self, started_app):
        result = await _run("c1ccccc1", "CCCCCC")  # no aromatic in hexane
        assert result.matched is False
        assert result.atom_indices == []
        assert result.bond_indices == []
        assert result.mapping_count == 0


class TestStereochemistry:
    @pytest.mark.asyncio
    async def test_stereo_ignored_matches_both_enantiomers(self, started_app):
        """(S)-lactic query matches (R)-lactic target when stereo disabled."""
        result = await _run(
            "C[C@@H](O)C(=O)O",
            "C[C@H](O)C(=O)O",
            match_stereo=False,
        )
        assert result.matched is True

    @pytest.mark.asyncio
    async def test_stereo_strict_rejects_opposite_enantiomer(self, started_app):
        result = await _run(
            "C[C@@H](O)C(=O)O",
            "C[C@H](O)C(=O)O",
            match_stereo=True,
        )
        assert result.matched is False
