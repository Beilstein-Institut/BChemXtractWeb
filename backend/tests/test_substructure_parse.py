"""Integration tests for parse_query — requires the JVM fixture."""

from __future__ import annotations

import pytest

from app.errors import InvalidQueryError, QueryTooLargeError
from app.services.jvm_bridge import run_in_jvm_thread
from app.services.substructure import parse_query


@pytest.mark.asyncio
async def test_parses_simple_smiles_as_smiles_path(started_app):
    parsed = await run_in_jvm_thread(parse_query, "c1ccccc1", match_stereo=False)
    assert parsed.language == "smiles"
    assert parsed.atom_count == 6
    assert parsed.stereo_enabled is False
    assert len(parsed.query_bond_endpoints) == 6  # benzene has 6 bonds


@pytest.mark.asyncio
async def test_parses_smarts_only_syntax_as_smarts_path(started_app):
    parsed = await run_in_jvm_thread(parse_query, "[CX3]=O", match_stereo=False)
    assert parsed.language == "smarts"
    assert parsed.atom_count == 2
    assert parsed.query_bond_endpoints in ([(0, 1)], [(1, 0)])


@pytest.mark.asyncio
async def test_parses_wildcard_smarts(started_app):
    parsed = await run_in_jvm_thread(parse_query, "[#6]", match_stereo=False)
    assert parsed.language == "smarts"
    assert parsed.atom_count == 1


@pytest.mark.asyncio
async def test_stereo_query_with_stereo_disabled_strips_tokens(started_app):
    """When match_stereo=False, stereo markers are removed before parsing."""
    parsed = await run_in_jvm_thread(parse_query, "F/C=C/F", match_stereo=False)
    # The parsed query has no stereo elements. (We can't easily introspect
    # CDK's stereo list from Python; the behavioral test at matching-time
    # in test_substructure_algorithm covers this.)
    assert parsed.language == "smiles"
    assert parsed.stereo_enabled is False


@pytest.mark.asyncio
async def test_invalid_query_raises_invalid_query_error(started_app):
    with pytest.raises(InvalidQueryError):
        await run_in_jvm_thread(parse_query, "c1ccc(((", match_stereo=False)


@pytest.mark.asyncio
async def test_empty_query_raises(started_app):
    with pytest.raises(InvalidQueryError):
        await run_in_jvm_thread(parse_query, "", match_stereo=False)


@pytest.mark.asyncio
async def test_oversized_query_raises_query_too_large(started_app):
    # 201-atom alkane chain is valid SMILES but above the MAX_QUERY_ATOMS cap.
    huge = "C" * 201
    with pytest.raises(QueryTooLargeError):
        await run_in_jvm_thread(parse_query, huge, match_stereo=False)
