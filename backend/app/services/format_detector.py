"""CDX/CDXML file format detection.

Pure Python -- no JVM calls. Detects binary CDX (VjCD magic bytes),
XML-based CDXML, or rejects unrecognized formats before they reach Java.
"""

from app.errors import FormatDetectionError

CDX_MAGIC = b"VjCD"
XML_PREFIXES = (b"<?xml", b"<CDXML")


def detect_format(file_bytes: bytes) -> str:
    """Detect whether file_bytes is CDX binary, CDXML, or unknown.

    Three-step detection per D-10:
    1. First 4 bytes == VjCD -> CDX binary
    2. Starts with <?xml or <CDXML (after stripping UTF-8 BOM) -> CDXML
    3. Neither -> raise FormatDetectionError (HTTP 415)

    Args:
        file_bytes: Raw file content bytes.

    Returns:
        "cdx" or "cdxml".

    Raises:
        FormatDetectionError: If format is not recognized or file too small.
    """
    if len(file_bytes) < 4:
        raise FormatDetectionError("File too small to identify format")

    if file_bytes[:4] == CDX_MAGIC:
        return "cdx"

    # Strip UTF-8 BOM if present before checking XML markers
    stripped = file_bytes.lstrip(b"\xef\xbb\xbf")
    for prefix in XML_PREFIXES:
        if stripped[: len(prefix)] == prefix:
            return "cdxml"

    raise FormatDetectionError(
        "Unrecognized file format: not CDX binary or CDXML"
    )
