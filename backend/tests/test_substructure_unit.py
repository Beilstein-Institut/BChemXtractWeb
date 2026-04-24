"""Unit tests for app.services.substructure — no JVM, no FastAPI."""

from __future__ import annotations

from app.services.substructure import (
    MAX_MAPPINGS_PER_MOL,
    MAX_QUERY_ATOMS,
    MatchResult,
    QueryValidation,
    strip_stereo_tokens,
)


class TestStripStereoTokens:
    def test_removes_at_symbols(self):
        assert strip_stereo_tokens("[C@H](O)(N)C") == "[CH](O)(N)C"

    def test_removes_double_at(self):
        assert strip_stereo_tokens("[C@@H](O)N") == "[CH](O)N"

    def test_removes_forward_slash_bond_stereo(self):
        assert strip_stereo_tokens("F/C=C/F") == "FC=CF"

    def test_removes_backslash_bond_stereo(self):
        assert strip_stereo_tokens(r"F\C=C\F") == "FC=CF"

    def test_preserves_non_stereo_characters(self):
        assert strip_stereo_tokens("c1ccccc1") == "c1ccccc1"
        assert strip_stereo_tokens("CC(=O)O") == "CC(=O)O"
        assert strip_stereo_tokens("[CX3]=O") == "[CX3]=O"

    def test_handles_mixed_stereo(self):
        assert strip_stereo_tokens("F/C=C/[C@H](O)C") == "FC=C[CH](O)C"

    def test_empty_string(self):
        assert strip_stereo_tokens("") == ""


class TestDataclasses:
    def test_match_result_holds_atoms_bonds_count_partial(self):
        r = MatchResult(
            matched=True,
            atom_indices=[0, 1, 2],
            bond_indices=[0, 1],
            mapping_count=2,
            partial_match=False,
        )
        assert r.matched is True
        assert r.atom_indices == [0, 1, 2]
        assert r.bond_indices == [0, 1]
        assert r.mapping_count == 2
        assert r.partial_match is False

    def test_query_validation_shape(self):
        v = QueryValidation(valid=True, language="smiles", atom_count=6, error=None)
        assert v.valid is True
        assert v.language == "smiles"
        assert v.atom_count == 6
        assert v.error is None

    def test_constants_defined(self):
        assert MAX_MAPPINGS_PER_MOL == 10_000
        assert MAX_QUERY_ATOMS == 200
