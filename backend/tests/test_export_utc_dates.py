"""Tests for UTC date handling in export artefacts (SEC L-01)."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from app.services.export import _generate_rxn_stub, _zip_filename


def test_zip_filename_uses_utc_today() -> None:
    today_utc = datetime.now(timezone.utc).date().strftime("%Y%m%d")
    assert today_utc in _zip_filename("sdf")
    assert _zip_filename("sdf") == f"bchemxtract_export_sdf_{today_utc}.zip"


def test_rxn_stub_datm_uses_utc() -> None:
    today_utc = datetime.now(timezone.utc).date().strftime("%Y/%m/%d")
    stub = _generate_rxn_stub()
    assert stub.startswith(b"$RDFILE 1\n$DATM")
    assert today_utc.encode() in stub


def test_datm_matches_expected_format() -> None:
    """RDfile $DATM format is yyyy/mm/dd per MDL spec."""
    stub = _generate_rxn_stub().decode()
    match = re.search(r"\$DATM\s+(\d{4}/\d{2}/\d{2})", stub)
    assert match is not None
    # Round-trip: parsing the extracted date must succeed.
    datetime.strptime(match.group(1), "%Y/%m/%d")
