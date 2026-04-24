"""Unit tests for app.services.substructure — no JVM, no FastAPI."""

from __future__ import annotations

from app.services.substructure import strip_stereo_tokens


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
