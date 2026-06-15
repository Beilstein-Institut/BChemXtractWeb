"""SMILES canonicalization helper."""

from __future__ import annotations

import pytest

from app.services.canonicalize import canonicalize_smiles


@pytest.mark.asyncio
async def test_canonicalize_aromatic_kekule_equivalent(started_app) -> None:
    """``c1ccccc1`` (aromatic) and ``C1=CC=CC=C1`` (Kekulé) collapse to same output."""
    aromatic = await canonicalize_smiles("c1ccccc1")
    kekule = await canonicalize_smiles("C1=CC=CC=C1")
    assert aromatic != ""
    assert aromatic == kekule, (
        f"expected same canonical form, got {aromatic!r} != {kekule!r}"
    )


@pytest.mark.asyncio
async def test_canonicalize_preserves_stereo(started_app) -> None:
    """``[C@H]`` and ``[C@@H]`` produce DIFFERENT canonical outputs."""
    left = await canonicalize_smiles("[C@H](O)(C)CC")
    right = await canonicalize_smiles("[C@@H](O)(C)CC")
    assert left != "" and right != ""
    assert left != right, "stereo must not collapse (SmiFlavor.Unique mistake)"


@pytest.mark.asyncio
async def test_canonicalize_empty_returns_empty(started_app) -> None:
    """Empty input short-circuits without JVM call."""
    assert await canonicalize_smiles("") == ""


@pytest.mark.asyncio
async def test_canonicalize_invalid_returns_empty(started_app) -> None:
    """Unparsable SMILES returns empty string, never raises."""
    assert await canonicalize_smiles("banana-not-smiles-XYZ!!") == ""
