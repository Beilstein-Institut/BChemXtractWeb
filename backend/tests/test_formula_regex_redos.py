"""Regression tests for the formula regex ReDoS fix.

The previous pattern ``^([A-Z][a-z]?\\d*)+$`` had catastrophic-backtracking
potential on CPython's ``re`` engine: an outer ``+`` quantifier over a
group whose inner pieces are themselves optional-or-unbounded. Crafted
input like 499 uppercase letters followed by a non-matching character
could drive measurable CPU load because every prefix of the input admits
multiple parse decompositions.

The replacement ``\\A(?:[A-Z][a-z]?\\d{0,5}){1,60}\\Z`` caps both the
inner digit run and the outer repeat so total work is linear in the
input length.
"""

from __future__ import annotations

import time

from app.services.search import detect_search_type


def _timed(fn, *args, **kwargs) -> float:
    t0 = time.perf_counter()
    fn(*args, **kwargs)
    return time.perf_counter() - t0


def test_benign_formula_detected() -> None:
    assert detect_search_type("C6H6") == "formula"
    assert detect_search_type("H2O") == "formula"
    assert detect_search_type("C18H32O16") == "formula"


def test_benign_smiles_not_miscategorised_as_formula() -> None:
    # Lowercase aromatic SMILES — must not match formula regex.
    assert detect_search_type("c1ccccc1") == "smiles"
    assert detect_search_type("CCO") == "formula"  # "C"+"C"+"O" — three elements


def test_pathological_uppercase_chain_bounded() -> None:
    """499 uppercase A's + a non-matching char; must not take noticeable CPU."""
    pathological = ("A" * 499) + "!"
    elapsed = _timed(detect_search_type, pathological)
    # On a 2025 M-series laptop the fixed regex completes in < 1 ms.
    # Generous 100 ms bound accommodates slow CI runners.
    assert elapsed < 0.1, f"formula regex took {elapsed * 1000:.1f} ms"


def test_pathological_digit_runs_bounded() -> None:
    """Outer quantifier still bounded when each unit packs the max digit run."""
    long_valid = "H" + "1" * 5
    pathological = (long_valid * 60) + "!"
    elapsed = _timed(detect_search_type, pathological)
    assert elapsed < 0.1, f"formula regex took {elapsed * 1000:.1f} ms"


def test_over_limit_uppercase_falls_through_to_smiles() -> None:
    """More than 60 element groups must NOT match formula — falls to smiles."""
    # 61 groups of a single uppercase letter — exceeds the {1,60} cap.
    input_61 = "A" * 61
    assert detect_search_type(input_61) != "formula"


def test_digit_run_over_cap_falls_through() -> None:
    """A digit run longer than 5 breaks the per-group pattern."""
    # 6-digit run — must not be classified as formula.
    assert detect_search_type("C1234567") == "smiles"
