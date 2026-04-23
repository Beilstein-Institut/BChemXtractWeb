"""Defensive XML guard for CDXML uploads (SEC C-01).

The upstream Java CDXMLReader hands bytes to a JAXP SAX parser with
``FEATURE_SECURE_PROCESSING`` NOT applied (``XMLUtils.parse(..., validate=false)``
in the read-only BChemXtract submodule). The bundled ``XMLEntityCatalog``
only knows about the local ``cdxml.dtd`` systemId and returns ``null`` for
everything else, which the SAX contract interprets as *"resolve externally
using default behaviour"* — giving any caller with a CDXML payload:

1. Local file read (``<!ENTITY x SYSTEM "file:///etc/passwd">``)
2. SSRF to internal services (``<!ENTITY x SYSTEM "http://169.254.169.254/...">``)
3. Billion-laughs / quadratic-blowup denial of service

Because the Java layer is read-only (upstream submodule, pinned), we harden
at the Python boundary. The guard:

  * rejects any ``<!ENTITY>`` declaration,
  * parses the DOCTYPE declaration structurally (respecting quoted
    literals) to extract its SYSTEM / PUBLIC external identifier, and
    requires the extracted literal to **exactly equal** one of the two
    catalogued DTD URLs,
  * rejects any DOCTYPE with an internal subset (``[...]``), which real
    ChemDraw files never emit and which could otherwise hide an external-DTD
    parameter entity reference that Xerces would fetch during prolog parsing.

Structural parsing replaces an earlier substring-membership check that
could be bypassed by placing a catalogued URL inside a comment, attribute,
or processing instruction near the DOCTYPE while the real SYSTEM id
pointed at an attacker-controlled URL.

The guard runs in bounded time (fixed 64 KB head scan, single regex pass)
regardless of total file length, so it cannot be weaponised for CPU
exhaustion itself.
"""

from __future__ import annotations

import re

from app.errors import FormatDetectionError

_HEAD_BYTES = 65_536
_DOCTYPE_MAX_LEN = 2_048

_DOCTYPE_RE = re.compile(rb"<!DOCTYPE\b", re.IGNORECASE)
_ENTITY_RE = re.compile(rb"<!ENTITY\b", re.IGNORECASE)

# External-ID extraction: matches either
#   SYSTEM "literal"        — group 3 holds the URL
# or
#   PUBLIC "pubid" "system" — group 5 holds the URL
# Quotes may be either " or ' and must match as a pair. Case-insensitive on
# the keyword; bytes inside the literal are matched verbatim so URL case
# stays significant for allow-list comparison.
_EXTERNAL_ID_RE = re.compile(
    rb"\b(SYSTEM|PUBLIC)\s+"
    rb"(['\"])([^'\"]*)\2"
    rb"(?:\s+(['\"])([^'\"]*)\4)?",
    re.IGNORECASE,
)

# Exact SYSTEM identifiers accepted by the upstream ``XMLEntityCatalog``
# (see ``backend/lib/bchemxtract/.../CDXMLConstants.java``). Either of
# these is resolved to a bundled local DTD; every other id causes the
# catalog to return ``null`` which tells the SAX parser to fetch
# externally — the XXE primitive. The guard therefore permits only these
# two values, matched by byte-exact equality.
_ALLOWED_SYSTEM_IDS: frozenset[bytes] = frozenset(
    {
        b"http://www.cambridgesoft.com/xml/cdxml.dtd",
        b"https://static.chemistry.revvitycloud.com/cdxml/CDXML.dtd",
    }
)


def _find_declaration_end(head: bytes, start: int, limit: int) -> int | None:
    """Return the index just past the closing ``>`` of an SGML/XML
    declaration starting at ``start``, respecting quoted string literals.

    ``limit`` caps the scan so malformed/oversize declarations don't walk
    off the end of the 64 KB head. Returns ``None`` if the declaration is
    unterminated within ``[start, limit)``.
    """
    i = start
    in_quote: int | None = None  # ord of the active quote char, or None
    while i < limit:
        ch = head[i]
        if in_quote is not None:
            if ch == in_quote:
                in_quote = None
        elif ch in (0x22, 0x27):  # '"' or "'"
            in_quote = ch
        elif ch == 0x3E:  # '>'
            return i + 1
        i += 1
    return None


def reject_xml_external_entities(file_bytes: bytes) -> None:
    """Reject CDXML payloads that could trigger XXE / SSRF / billion-laughs.

    Enforced rules:

      - No ``<!ENTITY>`` declarations of any kind.
      - If a ``<!DOCTYPE>`` declaration is present, it must:
          * terminate inside the first 2 KB after its start,
          * contain no internal subset (``[...]``),
          * either have no SYSTEM/PUBLIC external id, or have an external
            id whose literal URL is byte-exactly one of
            :data:`_ALLOWED_SYSTEM_IDS`.

    Args:
        file_bytes: Raw file content as delivered by the client.

    Raises:
        FormatDetectionError: On any payload matching the rules above.
            The error message is intentionally generic to avoid giving an
            attacker hints about which check fired.
    """
    head = file_bytes[:_HEAD_BYTES]

    if _ENTITY_RE.search(head):
        raise FormatDetectionError(
            "CDXML payload contains <!ENTITY> declarations, which are "
            "not permitted for security reasons."
        )

    doctype_match = _DOCTYPE_RE.search(head)
    if doctype_match is None:
        return

    doctype_start = doctype_match.start()
    limit = min(doctype_start + _DOCTYPE_MAX_LEN, len(head))
    doctype_end = _find_declaration_end(head, doctype_match.end(), limit)
    if doctype_end is None:
        raise FormatDetectionError(
            "CDXML DOCTYPE declaration is unterminated or exceeds the "
            "permitted size limit."
        )

    doctype_decl = head[doctype_start:doctype_end]

    if b"[" in doctype_decl:
        raise FormatDetectionError(
            "CDXML DOCTYPE contains an internal subset, which is not permitted."
        )

    external_id = _EXTERNAL_ID_RE.search(doctype_decl)
    if external_id is None:
        return

    keyword = external_id.group(1).upper()
    literal = external_id.group(3) if keyword == b"SYSTEM" else external_id.group(5)
    if literal is None or literal not in _ALLOWED_SYSTEM_IDS:
        raise FormatDetectionError(
            "CDXML DOCTYPE references an external identifier that is "
            "not in the permitted catalog. Only the bundled CDXML DTD "
            "URLs are allowed."
        )
