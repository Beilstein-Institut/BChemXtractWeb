"""SMILES canonicalization helper (D-04/D-05) — Wave 2 implementation."""

from __future__ import annotations

import pytest


@pytest.mark.skip(reason="Wave 2 — canonicalize.py not yet implemented")
def test_canonicalize_aromatic_kekule_equivalent() -> None:
    """`c1ccccc1` and `C1=CC=CC=C1` produce identical canonical output."""
    ...


@pytest.mark.skip(reason="Wave 2 — canonicalize.py not yet implemented")
def test_canonicalize_preserves_stereo() -> None:
    """`[C@H](O)(C)CC` and `[C@@H](O)(C)CC` produce DIFFERENT outputs."""
    ...


@pytest.mark.skip(reason="Wave 2 — canonicalize.py not yet implemented")
def test_canonicalize_empty_returns_empty() -> None:
    """Empty input returns empty string (D-09 skip semantics)."""
    ...


@pytest.mark.skip(reason="Wave 2 — canonicalize.py not yet implemented")
def test_canonicalize_invalid_returns_empty() -> None:
    """Unparsable SMILES returns empty string without raising."""
    ...
