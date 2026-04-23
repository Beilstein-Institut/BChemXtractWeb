"""Integration tests for persistence service (Phase 5).

Requirements: INFRA-05, HIST-01, HIST-02, HIST-03, HIST-04
Run: conda run -n cheminformatics pytest tests/test_persistence.py -x -q
"""

import pytest
from sqlalchemy import select

from app.models.chemistry import (
    ExtractionResponse,
    SubstanceInfoResponse,
    SubstanceResponse,
)
from app.models.orm import Extraction, Substance
from app.services.persistence import (
    delete_extraction_by_id,
    enforce_cap,
    save_extraction,
)

# Valid InChI key format: 14 chars + dash + 10 chars + dash + 1 char = 27 chars total
_KEY_A = "AAAAAAAAAAAAAA-UHFFFAOYSA-N"  # 27 chars
_KEY_B = "BBBBBBBBBBBBBB-UHFFFAOYSA-N"  # 27 chars
_KEY_C = "CCCCCCCCCCCCCC-UHFFFAOYSA-N"  # 27 chars
_KEY_D = "DDDDDDDDDDDDDD-UHFFFAOYSA-N"  # 27 chars


def _make_key(letter: str, index: int = 0) -> str:
    """Build a valid 27-char InChI key for testing."""
    prefix = f"{letter * 13}{index:01d}"  # 14 chars
    return f"{prefix}-UHFFFAOYSA-N"


def _make_response(
    filename: str = "test.cdx",
    inchi_keys: list[str] | None = None,
) -> ExtractionResponse:
    """Build a minimal ExtractionResponse for testing."""
    keys = inchi_keys or [_KEY_A]
    substances = [
        SubstanceResponse(
            inchi_key=k,
            inchi=f"InChI=1S/test/{i}",
            smiles=f"C{i}",
            molecular_formula=f"C{i}H{i}",
        )
        for i, k in enumerate(keys)
    ]
    return ExtractionResponse(
        substances=substances,
        info=SubstanceInfoResponse(no_substances=len(substances)),
        format="cdx",
        filename=filename,
        file_size=100,
        structure_count=len(substances),
        extraction_time_ms=50.0,
        warnings=[],
    )


@pytest.mark.asyncio
async def test_save_extraction_creates_extraction_row(db_session):
    """INFRA-05: save_extraction() inserts one Extraction row with correct metadata."""
    response = _make_response("molecule.cdx")
    extraction = await save_extraction(db_session, response)

    assert extraction.id is not None
    assert extraction.filename == "molecule.cdx"
    assert extraction.format == "cdx"
    assert extraction.structure_count == 1


@pytest.mark.asyncio
async def test_save_extraction_deduplicates_substances(db_session):
    """HIST-03: second save with same inchi_key produces one Substance row."""
    key = _KEY_B
    await save_extraction(db_session, _make_response("a.cdx", inchi_keys=[key]))
    await save_extraction(db_session, _make_response("b.cdx", inchi_keys=[key]))

    result = await db_session.execute(
        select(Substance).where(Substance.inchi_key == key)
    )
    substances = result.scalars().all()
    assert len(substances) == 1, "Same inchi_key must deduplicate to one Substance"


@pytest.mark.asyncio
async def test_save_extraction_skips_empty_inchi_key(db_session):
    """HIST-03: substance with empty inchi_key is not inserted."""
    response = _make_response("empty_key.cdx", inchi_keys=[""])
    extraction = await save_extraction(db_session, response)

    result = await db_session.execute(
        select(Substance).where(Substance.inchi_key == "")
    )
    rows = result.scalars().all()
    assert len(rows) == 0, "Empty inchi_key must not create a Substance row"
    assert extraction.id is not None


@pytest.mark.asyncio
async def test_delete_extraction_removes_orphaned_substances(db_session):
    """HIST-01/D-07: deleting an extraction removes orphaned substances."""
    unique_key = _KEY_C
    extraction = await save_extraction(
        db_session, _make_response("orphan.cdx", inchi_keys=[unique_key])
    )
    deleted = await delete_extraction_by_id(db_session, extraction.id)

    assert deleted is True
    result = await db_session.execute(
        select(Substance).where(Substance.inchi_key == unique_key)
    )
    assert result.scalar_one_or_none() is None, "Orphaned substance must be deleted"


@pytest.mark.asyncio
async def test_delete_extraction_keeps_shared_substances(db_session):
    """D-07: shared substance (referenced by another extraction) is not deleted."""
    shared_key = _KEY_D
    e1 = await save_extraction(
        db_session, _make_response("file1.cdx", inchi_keys=[shared_key])
    )
    await save_extraction(
        db_session, _make_response("file2.cdx", inchi_keys=[shared_key])
    )

    await delete_extraction_by_id(db_session, e1.id)

    result = await db_session.execute(
        select(Substance).where(Substance.inchi_key == shared_key)
    )
    assert result.scalar_one_or_none() is not None, "Shared substance must survive"


@pytest.mark.asyncio
async def test_enforce_cap_removes_oldest_extractions(db_session):
    """D-10: enforce_cap deletes oldest extractions when count exceeds max_count."""
    for i in range(5):
        await save_extraction(
            db_session,
            _make_response(f"cap{i}.cdx", inchi_keys=[_make_key("E", i)]),
        )
    await enforce_cap(db_session, max_count=3)

    result = await db_session.execute(select(Extraction))
    remaining = result.scalars().all()
    assert len(remaining) <= 3, f"Expected at most 3 extractions, got {len(remaining)}"
