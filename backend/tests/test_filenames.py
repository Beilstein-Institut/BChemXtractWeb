"""Tests for the centralised filename + Content-Disposition helpers."""

from __future__ import annotations

import pytest

from app.services.filenames import build_content_disposition, safe_filename

# ---------------------------------------------------------------------------
# safe_filename
# ---------------------------------------------------------------------------


def test_benign_filename_unchanged() -> None:
    assert safe_filename("molecules.cdx") == "molecules.cdx"
    assert safe_filename("2026-04-20_export.sdf") == "2026-04-20_export.sdf"


def test_path_traversal_neutralised() -> None:
    assert safe_filename("../../etc/passwd") == "etc_passwd"
    assert safe_filename("..\\..\\windows\\system32") == "windows_system32"
    assert safe_filename("/etc/passwd") == "etc_passwd"


def test_control_chars_stripped() -> None:
    assert safe_filename("bad\x00name.cdx") == "bad_name.cdx"
    assert safe_filename("bad\rname\ncdx") == "bad_name_cdx"
    assert safe_filename("bad\tname.cdx") == "bad_name.cdx"


def test_null_and_empty_get_fallback() -> None:
    assert safe_filename(None) == "unnamed"
    assert safe_filename("") == "unnamed"
    assert safe_filename("   ") == "unnamed"
    assert safe_filename("...") == "unnamed"  # strip(".") collapses to empty


def test_unicode_neutralised() -> None:
    # Emoji + non-ASCII characters become underscores.
    assert safe_filename("🔬 pharmacon.cdx") == "pharmacon.cdx"


def test_quotes_neutralised() -> None:
    """``"`` in a filename would terminate Content-Disposition early."""
    assert '"' not in safe_filename('he said "hi".cdx')


def test_length_capped() -> None:
    assert safe_filename("a" * 500) == "a" * 128
    assert safe_filename("a" * 500, max_len=10) == "a" * 10


def test_max_len_zero_rejected() -> None:
    with pytest.raises(ValueError):
        safe_filename("anything", max_len=0)


# ---------------------------------------------------------------------------
# build_content_disposition
# ---------------------------------------------------------------------------


def test_ascii_and_utf8_both_emitted() -> None:
    header = build_content_disposition("my export.sdf")
    assert 'filename="my_export.sdf"' in header
    assert "filename*=UTF-8''" in header
    assert "my%20export.sdf" in header


def test_crlf_injection_blocked() -> None:
    """CR/LF must be stripped from the ASCII fallback and percent-escaped
    in the UTF-8 portion — neither can terminate the header mid-stream
    so ``Set-Cookie`` or any other header injection is impossible."""
    header = build_content_disposition("x.sdf\r\nSet-Cookie: admin=true\r\n")
    assert "\r" not in header
    assert "\n" not in header


def test_quote_injection_blocked() -> None:
    header = build_content_disposition('x"; drop=1; .sdf')
    # The ASCII fallback must not carry an unescaped double-quote.
    prefix = header.split(";")[1]  # ' filename="..."'
    assert prefix.count('"') == 2


def test_inline_disposition_accepted() -> None:
    header = build_content_disposition("chart.svg", disposition="inline")
    assert header.startswith("inline;")


def test_unknown_disposition_rejected() -> None:
    with pytest.raises(ValueError):
        build_content_disposition("x.sdf", disposition="render")
