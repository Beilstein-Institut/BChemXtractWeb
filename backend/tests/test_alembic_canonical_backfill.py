"""D-05: Alembic migration + JVM-backed backfill (Wave 2)."""

from __future__ import annotations

import pytest


@pytest.mark.skip(reason="Wave 2 — migration not yet created")
@pytest.mark.asyncio
async def test_backfill_populates_canonical_smiles() -> None:
    """Upgrading on a seeded DB sets canonical_smiles for rows with smiles."""
    ...


@pytest.mark.skip(reason="Wave 2 — migration not yet created")
@pytest.mark.asyncio
async def test_backfill_is_idempotent() -> None:
    """Running upgrade twice is safe (WHERE canonical_smiles IS NULL)."""
    ...


@pytest.mark.skip(reason="Wave 2 — migration not yet created")
@pytest.mark.asyncio
async def test_backfill_leaves_unparsable_as_null() -> None:
    """Bad SMILES rows stay canonical_smiles=NULL (D-09 skip)."""
    ...
