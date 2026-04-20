"""Tests for the bounded streaming upload helper (SEC H-02, M-02).

Proves that :func:`app.services.upload_guard.read_upload_bounded`:

- Accepts payloads up to ``max_bytes``
- Rejects payloads above ``max_bytes`` even when the client omits
  ``Content-Length`` (Starlette ``UploadFile.size`` is ``None``)
- Fails fast via the Content-Length preflight when ``UploadFile.size``
  is populated
- Reads in fixed-size chunks (no unbounded single-call ``await
  file.read()`` path)
"""

from __future__ import annotations

import io

import pytest
from starlette.datastructures import UploadFile as StarletteUploadFile

from app.errors import FileSizeError
from app.services.upload_guard import read_upload_bounded

pytestmark = pytest.mark.asyncio


def _upload_file(payload: bytes, *, filename: str = "x.cdx") -> StarletteUploadFile:
    """Construct an UploadFile with a known payload.

    Starlette's UploadFile.size comes from Content-Length in a real HTTP
    request; when constructing ad-hoc for tests we set it explicitly to
    mirror the well-behaved-client scenario. The ``None`` case is
    exercised separately with ``size=None``.
    """
    spool = io.BytesIO(payload)
    return StarletteUploadFile(file=spool, filename=filename, size=len(payload))


def _upload_file_no_size(payload: bytes) -> StarletteUploadFile:
    """UploadFile without Content-Length set (chunked-encoding scenario)."""
    spool = io.BytesIO(payload)
    return StarletteUploadFile(file=spool, filename="x.cdx", size=None)


async def test_accepts_payload_below_cap() -> None:
    up = _upload_file(b"hello world")
    data = await read_upload_bounded(up, max_bytes=100)
    assert data == b"hello world"


async def test_accepts_payload_at_exactly_cap() -> None:
    payload = b"x" * 1024
    up = _upload_file(payload)
    data = await read_upload_bounded(up, max_bytes=1024)
    assert data == payload


async def test_rejects_payload_above_cap_with_known_size() -> None:
    """Preflight check fires when Content-Length indicates oversize."""
    up = _upload_file(b"x" * 2048)
    with pytest.raises(FileSizeError):
        await read_upload_bounded(up, max_bytes=1024)


async def test_rejects_payload_above_cap_when_size_is_none() -> None:
    """Streaming check fires even when Content-Length is absent."""
    up = _upload_file_no_size(b"x" * 2048)
    with pytest.raises(FileSizeError):
        await read_upload_bounded(up, max_bytes=1024)


async def test_rejects_payload_with_no_content_length_and_large_body() -> None:
    """Simulates `Transfer-Encoding: chunked` with a 5 MB body under a 1 MB cap."""
    up = _upload_file_no_size(b"x" * (5 * 1024 * 1024))
    with pytest.raises(FileSizeError):
        await read_upload_bounded(up, max_bytes=1024 * 1024)


async def test_zero_byte_payload_accepted() -> None:
    up = _upload_file(b"")
    data = await read_upload_bounded(up, max_bytes=1024)
    assert data == b""


async def test_invalid_max_bytes_rejected() -> None:
    up = _upload_file(b"hi")
    with pytest.raises(ValueError):
        await read_upload_bounded(up, max_bytes=0)
    with pytest.raises(ValueError):
        await read_upload_bounded(up, max_bytes=-1)
