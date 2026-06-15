"""Tests for explicit scope validation."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services.search import _parse_scope


def test_global_scope_returns_none() -> None:
    assert _parse_scope("global") is None


def test_valid_extraction_scope_returns_int() -> None:
    assert _parse_scope("extraction:42") == 42
    assert _parse_scope("extraction:1") == 1


def test_malformed_id_raises_400() -> None:
    with pytest.raises(HTTPException) as exc_info:
        _parse_scope("extraction:abc")
    assert exc_info.value.status_code == 400


def test_empty_id_raises_400() -> None:
    with pytest.raises(HTTPException) as exc_info:
        _parse_scope("extraction:")
    assert exc_info.value.status_code == 400


def test_zero_id_rejected() -> None:
    with pytest.raises(HTTPException) as exc_info:
        _parse_scope("extraction:0")
    assert exc_info.value.status_code == 400


def test_negative_id_rejected() -> None:
    with pytest.raises(HTTPException):
        _parse_scope("extraction:-1")


def test_unknown_scope_prefix_rejected() -> None:
    with pytest.raises(HTTPException):
        _parse_scope("user:42")


def test_empty_string_rejected() -> None:
    with pytest.raises(HTTPException):
        _parse_scope("")
