"""Tests for search request/response Pydantic models."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.chemistry import (
    SearchRequest,
    SearchResult,
    SearchValidateRequest,
    SearchValidateResponse,
    SubstanceResponse,
)


class TestSearchRequestStereo:
    def test_stereo_defaults_to_false(self):
        req = SearchRequest(query="c1ccccc1")
        assert req.stereo is False

    def test_stereo_can_be_set_true(self):
        req = SearchRequest(query="C[C@H](O)N", stereo=True)
        assert req.stereo is True


class TestSearchResultNewFields:
    def test_match_bond_indices_defaults_empty(self):
        r = SearchResult(substance=SubstanceResponse())
        assert r.match_bond_indices == []

    def test_partial_match_defaults_false(self):
        r = SearchResult(substance=SubstanceResponse())
        assert r.partial_match is False

    def test_fields_round_trip(self):
        r = SearchResult(
            substance=SubstanceResponse(),
            match_bond_indices=[0, 1, 2],
            partial_match=True,
        )
        assert r.match_bond_indices == [0, 1, 2]
        assert r.partial_match is True


class TestSearchValidateRequest:
    def test_minimal(self):
        r = SearchValidateRequest(query="c1ccccc1")
        assert r.query == "c1ccccc1"
        assert r.stereo is False

    def test_rejects_empty_query(self):
        with pytest.raises(ValidationError):
            SearchValidateRequest(query="")

    def test_rejects_oversize_query(self):
        with pytest.raises(ValidationError):
            SearchValidateRequest(query="C" * 501)


class TestSearchValidateResponse:
    def test_valid_smiles_response(self):
        r = SearchValidateResponse(
            valid=True, language="smiles", atom_count=6, error=None
        )
        assert r.valid is True
        assert r.language == "smiles"

    def test_invalid_response(self):
        r = SearchValidateResponse(
            valid=False, language=None, atom_count=0, error="Unclosed ring"
        )
        assert r.valid is False
        assert r.error == "Unclosed ring"
