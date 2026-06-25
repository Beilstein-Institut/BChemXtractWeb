"""Regression guards for the search/stats RLS fix (CWE-639).

The ``substances`` table is a global, ``inchi_key``-deduplicated pool with no
row-level security of its own. Cross-session isolation therefore depends
entirely on every substance read going through the RLS-protected
``ExtractionSubstance`` join. These structural tests pin that contract so a
future refactor cannot silently reintroduce a bare ``select(Substance)`` that
would expose every session's structures.

Behavioural enforcement (client A cannot see client B's structures) is
covered under the NOSUPERUSER role in ``test_session_isolation.py``; it is
skipped on the superuser test DB because Postgres bypasses RLS there.
"""

from __future__ import annotations

from app.services.search import _base_substance_select


def test_global_substance_select_routes_through_rls_join() -> None:
    """Global scope (``None``) must JOIN ``extraction_substances`` so RLS can
    scope the result — a bare ``select(Substance)`` would leak cross-session.
    """
    sql = str(_base_substance_select(None)).lower()
    assert "extraction_substances" in sql, sql
    assert "join" in sql, sql


def test_extraction_scoped_select_filters_by_extraction_id() -> None:
    """Extraction scope keeps the join and adds the ``extraction_id`` filter."""
    sql = str(_base_substance_select(42)).lower()
    assert "extraction_substances" in sql, sql
    assert "extraction_id" in sql, sql
