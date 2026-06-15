"""Bounded, streaming reads for multipart upload bodies.

The naive ``await file.read()`` on ``fastapi.UploadFile`` buffers the
*entire* request body into memory before any size check fires. Combined
with ``Transfer-Encoding: chunked`` (no ``Content-Length``) that lets a
malicious client push gigabytes of garbage into backend RAM before the
backend's declared ``max_upload_size`` takes effect.

This helper streams the upload chunk-by-chunk and aborts the read
deterministically the moment the accumulated size exceeds the cap. The
half-consumed chunk is discarded without leaking into RAM (aside from
the single chunk under the reader's control) and a :class:`FileSizeError`
is raised — surfaced to the client as ``413 FILE_TOO_LARGE`` through the
unified ``ErrorResponse`` shape.

Rationale for the 64 KB chunk size: Starlette's multipart parser
delivers body parts in chunks of this order already, so larger values
do not help and smaller values waste syscalls. The constant is exposed
as a module-level symbol so tests can shrink it to force small-buffer
edge cases.
"""

from __future__ import annotations

from fastapi import UploadFile

from app.errors import FileSizeError

_CHUNK_BYTES = 64 * 1024


async def read_upload_bounded(file: UploadFile, max_bytes: int) -> bytes:
    """Read ``file`` into memory, aborting if the payload exceeds ``max_bytes``.

    Performs an optional pre-flight check against ``UploadFile.size`` (set
    from ``Content-Length``) to fail fast on well-behaved clients, then
    streams the body in fixed-size chunks and raises :class:`FileSizeError`
    the moment cumulative bytes pass ``max_bytes`` — even if the client
    omitted ``Content-Length`` or used chunked transfer encoding.

    Args:
        file: The uploaded file handle.
        max_bytes: Hard cap on the payload size in bytes.

    Returns:
        The full file content as a single bytes object.

    Raises:
        FileSizeError: If the payload exceeds ``max_bytes`` (HTTP 413).
    """
    if max_bytes <= 0:
        raise ValueError("max_bytes must be positive")

    if file.size is not None and file.size > max_bytes:
        raise FileSizeError(
            f"File exceeds the {max_bytes // (1024 * 1024)} MB size limit. "
            f"Please upload a smaller file."
        )

    buf = bytearray()
    while True:
        chunk = await file.read(_CHUNK_BYTES)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > max_bytes:
            # Discard the accumulated buffer before raising so the event
            # loop doesn't hold a gigabyte reference while unwinding.
            buf = bytearray()
            raise FileSizeError(
                f"File exceeds the {max_bytes // (1024 * 1024)} MB size "
                f"limit. Please upload a smaller file."
            )
    return bytes(buf)
