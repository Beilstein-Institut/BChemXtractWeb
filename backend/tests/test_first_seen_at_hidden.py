"""Assert first_seen_at is absent from API response shapes.

The columns ``substances.first_seen_at`` and ``reactions.first_seen_at``
remain in the database for ops/forensics, but neither flows into any API
response shape — Pydantic's ``model_validate(orm_row)`` drops the
attribute because the response model does not declare it.

Two checks:

1. ``SubstanceResponse`` and ``ReactionResponse`` (the canonical
   response models) do not declare a ``first_seen_at`` field.
2. The ORM columns ``Substance.first_seen_at`` and
   ``Reaction.first_seen_at`` still exist.

A third (integration) check that issues an HTTP extract + asserts the
JSON shape lives in the existing ``test_extract_endpoint.py``. We do not
add a duplicate HTTP test here because it would require the JVM + a live
DB; the unit assertions below are sufficient to catch a regression that
ever adds the field to the Pydantic models.
"""

from __future__ import annotations

from sqlalchemy import inspect

from app.models.chemistry import ReactionResponse, SubstanceResponse
from app.models.orm import Reaction, Substance


def test_substance_response_does_not_expose_first_seen_at() -> None:
    """SubstanceResponse must not declare first_seen_at."""
    assert "first_seen_at" not in SubstanceResponse.model_fields, (
        f"SubstanceResponse leaked first_seen_at: "
        f"{list(SubstanceResponse.model_fields)}"
    )


def test_reaction_response_does_not_expose_first_seen_at() -> None:
    """ReactionResponse must not declare first_seen_at."""
    assert "first_seen_at" not in ReactionResponse.model_fields, (
        f"ReactionResponse leaked first_seen_at: {list(ReactionResponse.model_fields)}"
    )


def test_substance_orm_column_first_seen_at_retained() -> None:
    """The DB column stays — the field is hidden from the API surface but
    kept for ops / forensics.
    """
    cols = {c.name for c in inspect(Substance).columns}
    assert "first_seen_at" in cols, (
        f"Substance ORM lost first_seen_at column: {sorted(cols)}"
    )


def test_reaction_orm_column_first_seen_at_retained() -> None:
    """Same as above for Reaction."""
    cols = {c.name for c in inspect(Reaction).columns}
    assert "first_seen_at" in cols, (
        f"Reaction ORM lost first_seen_at column: {sorted(cols)}"
    )
