"""Centralised filename + Content-Disposition helpers (SEC M-03 / M-04).

Upload filenames and extraction identifiers flow into several response
surfaces — ZIP entry names, ``Content-Disposition`` headers, streamed
file paths — each of which has its own rules for what's safe. Previously
each call site did its own ad-hoc ``.replace("/", "_")`` dance; this
module centralises the rules so a new surface cannot forget a control
character.

Two functions:

* :func:`safe_filename` — allowlist-based slug for ZIP entries, disk
  paths, and the ASCII fallback portion of ``Content-Disposition``. Only
  ``[A-Za-z0-9._-]`` survive; every other byte (NUL, CR/LF, tabs,
  slashes, unprintables, emoji) becomes ``_``. Truncates to 128 chars.
* :func:`build_content_disposition` — assembles RFC 6266 headers with
  both ASCII ``filename`` and UTF-8 ``filename*`` parameters, both
  derived from :func:`safe_filename` plus ``quote()`` so no control
  character can escape into the header stream.
"""

from __future__ import annotations

import re
from urllib.parse import quote

_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._\-]+")
_DEFAULT_FALLBACK = "unnamed"


def safe_filename(name: str | None, *, max_len: int = 128) -> str:
    """Return a filename restricted to ``[A-Za-z0-9._-]`` (allowlist).

    Collapses runs of disallowed characters into a single ``_`` so the
    result is stable and readable. Strips leading / trailing dots so the
    slug cannot be interpreted as a hidden file (``.rc``) or a
    directory-traversal token (``..``). Always returns a non-empty
    string of at most ``max_len`` characters.

    Args:
        name: Any user- or system-provided string. ``None`` or the empty
            string becomes the fallback.
        max_len: Hard cap on output length (default 128).

    Returns:
        Sanitised slug, guaranteed non-empty and within ``max_len``.
    """
    if max_len < 1:
        raise ValueError("max_len must be >= 1")
    raw = (name or "").strip()
    if not raw:
        return _DEFAULT_FALLBACK
    slug = _SAFE_NAME_RE.sub("_", raw).strip("._")
    if not slug:
        return _DEFAULT_FALLBACK
    return slug[:max_len]


def build_content_disposition(filename: str, *, disposition: str = "attachment") -> str:
    """Construct an RFC 6266-compliant ``Content-Disposition`` value.

    Emits BOTH an ASCII ``filename="..."`` and a UTF-8 ``filename*=...``
    parameter so both legacy and modern clients get a sensible download
    name. The ASCII portion runs through :func:`safe_filename` so a
    name containing ``"`` / CRLF / null cannot terminate the header
    early or inject additional headers. The UTF-8 portion is
    percent-encoded via :func:`urllib.parse.quote` with no ``safe``
    exceptions so every non-unreserved byte is escaped.

    Args:
        filename: Logical filename for the attachment. May contain any
            Unicode characters; sanitisation happens inside.
        disposition: ``"attachment"`` (default) or ``"inline"`` —
            callers that want in-browser display of SVG / images set
            this. Any other value is rejected.

    Returns:
        The complete header value (not including the field name).
    """
    if disposition not in {"attachment", "inline"}:
        raise ValueError(f"unsupported disposition: {disposition!r}")
    ascii_fallback = safe_filename(filename)
    encoded = quote(filename or ascii_fallback, safe="")
    return f"{disposition}; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"
