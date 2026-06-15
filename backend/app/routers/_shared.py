"""Shared helpers used by the extraction-style routers.

Keeping these in one place prevents drift between the substance and
reaction upload paths (previously they carried identical copies of the
extension-mismatch check and the content-detection extension map).
"""

from __future__ import annotations

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
    detection (magic-bytes / XML probe) is always authoritative.

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
