"""Tests for ``ExportRequest`` size bounds.

The model rejects requests where ``substance_ids`` or ``reaction_ids``
exceed the Pydantic ``max_length`` cap before the router ever runs a DB
query or schedules JVM work.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.chemistry import ExportRequest


def test_substance_ids_at_limit_accepted() -> None:
    req = ExportRequest(format="sdf", substance_ids=list(range(1000)))
    assert len(req.substance_ids) == 1000


def test_substance_ids_above_limit_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        ExportRequest(format="sdf", substance_ids=list(range(1001)))
    assert "at most 1000" in str(exc_info.value).lower() or "max_length" in str(
        exc_info.value
    )


def test_reaction_ids_at_limit_accepted() -> None:
    req = ExportRequest(format="rxn", reaction_ids=list(range(500)))
    assert len(req.reaction_ids) == 500


def test_reaction_ids_above_limit_rejected() -> None:
    with pytest.raises(ValidationError):
        ExportRequest(format="rxn", reaction_ids=list(range(501)))


def test_empty_lists_are_valid() -> None:
    """Empty lists are permitted — the router pairs them with
    ``extraction_id`` for the Export-All path."""
    req = ExportRequest(format="sdf", extraction_id=42)
    assert req.substance_ids == []
    assert req.reaction_ids == []
