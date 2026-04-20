"""Defensive XML guard for CDXML uploads (SEC C-01).

The upstream Java CDXMLReader hands bytes to a JAXP SAX parser with
``FEATURE_SECURE_PROCESSING`` NOT applied (``XMLUtils.parse(..., validate=false)``
in the read-only BChemXtract submodule). The bundled ``XMLEntityCatalog``
only knows about the local ``cdxml.dtd`` systemId and returns ``null`` for
everything else, which the SAX contract interprets as *"resolve externally
using default behaviour"* — giving any anonymous caller with a CDXML
payload:

1. Local file read (``<!ENTITY x SYSTEM "file:///etc/passwd">``)
2. SSRF to internal services (``<!ENTITY x SYSTEM "http://169.254.169.254/...">``)
3. Billion-laughs / quadratic-blowup denial of service

Because the Java layer is read-only (upstream submodule, pinned), we
harden at the Python boundary. Any CDXML payload containing a ``<!ENTITY>``
declaration OR a ``<!DOCTYPE>`` with a SYSTEM identifier that doesn't point
at the permitted local ``cdxml.dtd`` catalog entry is rejected with HTTP
415 (``FormatDetectionError``) before the bytes ever reach the JVM.

This is intentionally strict: real CDXML files produced by ChemDraw
never declare custom entities, and the only ``SYSTEM`` id we need to
permit is the catalogued ``cdxml.dtd``.

The guard runs in constant-ish time (fixed-size head scan, single regex
pass) regardless of total file length so it cannot be weaponised for CPU
exhaustion itself.
"""

from __future__ import annotations

import re

from app.errors import FormatDetectionError

# Only scan the prolog — DOCTYPE/ENTITY declarations MUST appear before the
# root element per the XML 1.0 spec. A 64 KB head is plenty: legitimate
# CDXML prologs are < 200 bytes, and a payload padding garbage into the
# scan window can't bypass this (we scan unconditionally).
_HEAD_BYTES = 65_536

# Case-insensitive, bytestring matching — CDXML bytes haven't been decoded yet.
_DOCTYPE_RE = re.compile(rb"<!DOCTYPE\b", re.IGNORECASE)
_ENTITY_RE = re.compile(rb"<!ENTITY\b", re.IGNORECASE)
_SYSTEM_OR_PUBLIC_RE = re.compile(rb"\b(?:SYSTEM|PUBLIC)\b", re.IGNORECASE)

# The only SYSTEM identifier we allow inside a DOCTYPE — the local
# catalogued DTD shipped with BChemXtract. Anything else (file:/, http:/,
# jar:/, ftp:/, etc.) is rejected.
_ALLOWED_SYSTEM_ID = b"cdxml.dtd"


def reject_xml_external_entities(file_bytes: bytes) -> None:
    """Reject CDXML payloads that could trigger XXE / SSRF / billion-laughs.

    Enforced rules:
      - No ``<!ENTITY>`` declarations of any kind.
      - If a ``<!DOCTYPE>`` declaration is present, it must NOT contain
        SYSTEM or PUBLIC identifiers other than the permitted
        ``cdxml.dtd`` catalog entry.

    Args:
        file_bytes: Raw file content as delivered by the client.

    Raises:
        FormatDetectionError: On any payload matching the rules above.
            The error message is intentionally generic to avoid giving an
            attacker hints about which check fired.
    """
    head = file_bytes[:_HEAD_BYTES]

    # Fast bail for non-XML-ish bytes — the head scan runs in constant
    # time regardless of total file length, but skipping early is harmless.
    if _ENTITY_RE.search(head):
        raise FormatDetectionError(
            "CDXML payload contains <!ENTITY> declarations, which are "
            "not permitted for security reasons."
        )

    doctype_match = _DOCTYPE_RE.search(head)
    if doctype_match is None:
        return  # No DOCTYPE, no entities — safe prolog.

    # Scan a bounded window after the DOCTYPE start for SYSTEM/PUBLIC
    # identifiers. 2 KB comfortably covers every real-world CDXML DOCTYPE
    # and keeps the check O(1) in file size.
    window_end = min(doctype_match.start() + 2_048, len(head))
    doctype_window = head[doctype_match.start() : window_end]

    if _SYSTEM_OR_PUBLIC_RE.search(doctype_window):
        # A SYSTEM/PUBLIC id is present — allow only if it matches the
        # catalogued cdxml.dtd entry.
        if _ALLOWED_SYSTEM_ID not in doctype_window:
            raise FormatDetectionError(
                "CDXML DOCTYPE references an external identifier other "
                "than the permitted cdxml.dtd catalog entry."
            )
