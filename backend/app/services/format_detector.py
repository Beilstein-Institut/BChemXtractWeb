"""CDX/CDXML file format detection.

Pure Python -- no JVM calls. Detects binary CDX (VjCD magic bytes),
XML-based CDXML, or rejects unrecognized formats before they reach Java.

Defensive XXE / SSRF / billion-laughs rejection for CDXML payloads lives
in :mod:`app.services.xml_guard` and runs *here* as part of detection so
every call site (extract, reactions, batch, tasks) benefits automatically.
"""

from app.errors import FormatDetectionError
from app.services.xml_guard import reject_xml_external_entities

CDX_MAGIC = b"VjCD"
XML_PREFIXES = (b"<?xml", b"<CDXML")

_EXTENSION_FORMAT_MAP: dict[str, str] = {
    ".cdx": "cdx",
    ".cdxml": "cdxml",
}

_FORMAT_LABELS: dict[str, str] = {
    "cdx": "CDX binary",
    "cdxml": "CDXML",
}


def check_extension_mismatch(filename: str, detected_format: str) -> list[str]:
    """Return warnings when the file extension disagrees with content detection.

    Extension mismatch is a warning, not an error — the content-based
    detection (magic-bytes / XML probe) is always authoritative. Lives here
    next to :func:`detect_format` so every call site (extract, reactions,
    batch tasks) shares one implementation regardless of layer.

    Args:
        filename: Original upload filename.
        detected_format: Format detected from content ("cdx" or "cdxml").

    Returns:
        List with a single human-readable warning, or ``[]`` when the
        extension matches (or is absent / unknown).
    """
    if "." not in filename:
        return []
    ext = "." + filename.rsplit(".", 1)[-1].lower()
    expected = _EXTENSION_FORMAT_MAP.get(ext)
    if expected is None or expected == detected_format:
        return []
    ext_label = _FORMAT_LABELS[expected]
    detected_label = _FORMAT_LABELS[detected_format]
    return [
        f"File extension suggests {ext_label} but content detected as "
        f"{detected_label}. Processing as {detected_label}."
    ]


def detect_format(file_bytes: bytes) -> str:
    """Detect whether file_bytes is CDX binary, CDXML, or unknown.

    Three-step detection:
    1. First 4 bytes == VjCD -> CDX binary
    2. Starts with <?xml or <CDXML (after stripping UTF-8 BOM) -> CDXML
    3. Neither -> raise FormatDetectionError (HTTP 415)

    When step 2 matches, the payload is additionally run through
    :func:`app.services.xml_guard.reject_xml_external_entities` to reject
    external DOCTYPEs and ``<!ENTITY>`` declarations before the bytes reach
    the (unhardened) upstream Java SAX parser.

    Args:
        file_bytes: Raw file content bytes.

    Returns:
        "cdx" or "cdxml".

    Raises:
        FormatDetectionError: If format is not recognized, file too small,
            or the CDXML payload contains unsafe XML constructs.
    """
    if len(file_bytes) < 4:
        raise FormatDetectionError("File too small to identify format")

    if file_bytes[:4] == CDX_MAGIC:
        return "cdx"

    # Strip UTF-8 BOM if present before checking XML markers
    stripped = file_bytes.lstrip(b"\xef\xbb\xbf")
    for prefix in XML_PREFIXES:
        if stripped[: len(prefix)] == prefix:
            reject_xml_external_entities(file_bytes)
            return "cdxml"

    raise FormatDetectionError("Unrecognized file format: not CDX binary or CDXML")
