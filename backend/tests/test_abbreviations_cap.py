"""Tests for the abbreviations-size cap.

A malicious ChemDraw file can declare thousands of abbreviations or
very long abbreviation strings. The coercion layer in
:mod:`app.services.extractor` enforces per-substance bounds so those
payloads can't drive unbounded memory growth in responses.
"""

from __future__ import annotations

from unittest.mock import MagicMock

from app.services.extractor import (
    _MAX_ABBREV_ENTRIES,
    _MAX_ABBREV_VALUE_LEN,
    _coerce_substance,
)


def _make_java_sub(abbrevs: dict) -> MagicMock:
    """Construct a minimal stub mimicking a Java BCXSubstance object."""
    sub = MagicMock()
    sub.getInchi.return_value = ""
    sub.getInchiKey.return_value = ""
    sub.getSmiles.return_value = ""
    sub.getExtendedSmiles.return_value = ""
    sub.getIupacName.return_value = ""
    sub.getMolecularFormula.return_value = ""
    sub.getAuxInfo.return_value = ""
    sub.getAbbreviations.return_value = abbrevs
    return sub


def test_small_abbreviation_dict_pass_through_untouched() -> None:
    sub = _make_java_sub({"Me": "CH3", "Et": "CC"})
    result = _coerce_substance(sub)
    assert result["abbreviations"] == {"Me": "CH3", "Et": "CC"}


def test_excessive_entries_truncated_to_cap() -> None:
    many = {f"abbr_{i}": f"val_{i}" for i in range(_MAX_ABBREV_ENTRIES + 50)}
    sub = _make_java_sub(many)
    result = _coerce_substance(sub)
    assert len(result["abbreviations"]) == _MAX_ABBREV_ENTRIES


def test_oversize_key_and_value_truncated() -> None:
    long_key = "K" * (_MAX_ABBREV_VALUE_LEN * 2)
    long_val = "V" * (_MAX_ABBREV_VALUE_LEN * 2)
    sub = _make_java_sub({long_key: long_val})
    result = _coerce_substance(sub)
    [(k, v)] = result["abbreviations"].items()
    assert len(k) == _MAX_ABBREV_VALUE_LEN
    assert len(v) == _MAX_ABBREV_VALUE_LEN


def test_none_abbreviations_coerced_to_empty() -> None:
    sub = _make_java_sub(None)
    result = _coerce_substance(sub)
    assert result["abbreviations"] == {}
