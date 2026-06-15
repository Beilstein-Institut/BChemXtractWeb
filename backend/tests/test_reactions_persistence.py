"""Tests for save_reactions + orphan cleanup.

Covers:
- save_reactions column persistence + JSONB components shape
- long_rinchi_key UNIQUE dedup
- NO_RINCHI_{sha1(reaction_smiles)} synthetic fallback
- Extraction.reaction_count update path
- delete_extraction_by_id orphan-reaction cleanup
- shared-reaction survival when one linking extraction is deleted
- get_or_create_extraction_row idempotence: a repeat upload of the same file
  reuses its existing Extraction row instead of creating a duplicate
- get_extraction_reactions ordered by position
"""

from sqlalchemy import select

from app.models.chemistry import (
    ReactionComponentResponse,
    ReactionResponse,
)
from app.models.orm import (
    Extraction,
    Reaction,
)
from app.services.persistence import (
    delete_extraction_by_id,
    get_extraction_reactions,
    get_or_create_extraction_row,
    save_reactions,
)


def _mk_reaction(
    rinchi: str = "",
    long_key: str = "Long-RInChI-Key-ABC",
    smiles: str = "CC>>CCO",
    svg: str = "<svg/>",
) -> ReactionResponse:
    """Build a minimal ReactionResponse for persistence tests."""
    return ReactionResponse(
        rinchi=rinchi,
        rinchi_key="",
        short_rinchi_key="Short-ABC",
        long_rinchi_key=long_key,
        web_rinchi_key="Web-ABC",
        reaction_smiles=smiles,
        aux_info="",
        reactants=[ReactionComponentResponse(inchi_key="REACT-KEY")],
        products=[ReactionComponentResponse(inchi_key="PROD-KEY")],
        agents=[],
        svg=svg,
    )


async def _mk_extraction(db_session, filename: str = "test.cdx") -> int:
    """Create (or reuse) an Extraction row via the get-or-create helper."""
    return await get_or_create_extraction_row(
        db_session,
        filename=filename,
        file_size=100,
        format="cdx",
        file_hash="abc123",
    )


async def test_save_reactions_inserts_all_columns(db_session):
    """save_reactions writes all Reaction columns including components JSONB."""
    eid = await _mk_extraction(db_session)
    await save_reactions(db_session, eid, [_mk_reaction()])
    result = await db_session.execute(
        select(Reaction).where(Reaction.long_rinchi_key == "Long-RInChI-Key-ABC")
    )
    r = result.scalar_one()
    assert r.reaction_smiles == "CC>>CCO"
    assert r.svg == "<svg/>"
    assert r.components["reactants"][0]["inchi_key"] == "REACT-KEY"
    # JSONB assertion
    assert "products" in r.components


async def test_save_reactions_deduplicates_by_long_rinchi_key(db_session):
    """Two identical reactions collapse to one Reaction row."""
    eid1 = await _mk_extraction(db_session, "a.cdx")
    eid2 = await _mk_extraction(db_session, "b.cdx")
    await save_reactions(db_session, eid1, [_mk_reaction(long_key="DUP-KEY-1")])
    await save_reactions(db_session, eid2, [_mk_reaction(long_key="DUP-KEY-1")])
    result = await db_session.execute(
        select(Reaction).where(Reaction.long_rinchi_key == "DUP-KEY-1")
    )
    rows = result.scalars().all()
    assert len(rows) == 1  # dedup'd


async def test_save_reactions_synthetic_key_fallback(db_session):
    """Empty long_rinchi_key gets NO_RINCHI_{sha1(reaction_smiles)} synthetic key."""
    eid = await _mk_extraction(db_session)
    # Reaction with empty long_rinchi_key -> synthetic fallback
    await save_reactions(db_session, eid, [_mk_reaction(long_key="", smiles="OC>>O")])
    result = await db_session.execute(
        select(Reaction).where(Reaction.long_rinchi_key.like("NO_RINCHI_%"))
    )
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].long_rinchi_key.startswith("NO_RINCHI_")


async def test_save_reactions_updates_extraction_reaction_count(db_session):
    """After save_reactions, Extraction.reaction_count == len(reactions)."""
    eid = await _mk_extraction(db_session)
    await save_reactions(
        db_session,
        eid,
        [_mk_reaction(long_key="K-1"), _mk_reaction(long_key="K-2")],
    )
    result = await db_session.execute(select(Extraction).where(Extraction.id == eid))
    assert result.scalar_one().reaction_count == 2


async def test_save_reactions_empty_list_sets_count_zero(db_session):
    """Empty reactions list still updates reaction_count to 0."""
    eid = await _mk_extraction(db_session)
    await save_reactions(db_session, eid, [])
    result = await db_session.execute(select(Extraction).where(Extraction.id == eid))
    assert result.scalar_one().reaction_count == 0


async def test_delete_extraction_cleans_orphan_reactions(db_session):
    """After deleting its sole Extraction, a Reaction with no joins is deleted."""
    eid = await _mk_extraction(db_session)
    await save_reactions(db_session, eid, [_mk_reaction(long_key="ORPHAN-KEY")])
    await delete_extraction_by_id(db_session, eid)
    result = await db_session.execute(
        select(Reaction).where(Reaction.long_rinchi_key == "ORPHAN-KEY")
    )
    assert result.scalar_one_or_none() is None


async def test_delete_extraction_keeps_shared_reactions(db_session):
    """A Reaction linked to 2 extractions survives deletion of one."""
    eid1 = await _mk_extraction(db_session, "a.cdx")
    eid2 = await _mk_extraction(db_session, "b.cdx")
    await save_reactions(db_session, eid1, [_mk_reaction(long_key="SHARED-KEY")])
    await save_reactions(db_session, eid2, [_mk_reaction(long_key="SHARED-KEY")])
    # Delete only eid1
    await delete_extraction_by_id(db_session, eid1)
    result = await db_session.execute(
        select(Reaction).where(Reaction.long_rinchi_key == "SHARED-KEY")
    )
    assert result.scalar_one_or_none() is not None  # survives


async def test_get_or_create_extraction_row_idempotent(db_session):
    """get_or_create_extraction_row reuses existing rows for matching fingerprints."""
    id1 = await get_or_create_extraction_row(
        db_session,
        filename="same.cdx",
        file_size=100,
        format="cdx",
        file_hash="h1",
    )
    id2 = await get_or_create_extraction_row(
        db_session,
        filename="same.cdx",
        file_size=100,
        format="cdx",
        file_hash="h1",
    )
    assert id1 == id2


async def test_get_extraction_reactions_ordered_by_position(db_session):
    """Cached reactions returned in insertion order (position asc)."""
    eid = await _mk_extraction(db_session, "order.cdx")
    await save_reactions(
        db_session,
        eid,
        [
            _mk_reaction(long_key="FIRST-KEY", smiles="A>>B"),
            _mk_reaction(long_key="SECOND-KEY", smiles="C>>D"),
            _mk_reaction(long_key="THIRD-KEY", smiles="E>>F"),
        ],
    )
    result = await get_extraction_reactions(db_session, eid)
    assert result is not None
    extraction, reactions = result
    assert extraction.id == eid
    assert extraction.reaction_count == 3
    # Ordered by position
    assert reactions[0].long_rinchi_key == "FIRST-KEY"
    assert reactions[1].long_rinchi_key == "SECOND-KEY"
    assert reactions[2].long_rinchi_key == "THIRD-KEY"


async def test_get_extraction_reactions_returns_none_for_unknown_id(db_session):
    """Unknown extraction_id -> None (router converts to 404)."""
    result = await get_extraction_reactions(db_session, 999999)
    assert result is None
