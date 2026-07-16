"""Integration tests for persistence service.

Run: conda run -n cheminformatics pytest tests/test_persistence.py -x -q
"""

import pytest
from sqlalchemy import func, select

from app.models.chemistry import (
    ExtractionResponse,
    SubstanceInfoResponse,
    SubstanceResponse,
)
from app.models.orm import Extraction, Substance
from app.services.persistence import (
    delete_extraction_by_id,
    enforce_cap,
    make_dedup_key,
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
async def test_save_extraction_stores_inchi_less_substance_with_empty_key(db_session):
    """An InChI-less substance (real InChIKey skipped) is still stored, keyed by
    a SMILES-derived dedup_key — but its inchi_key stays "" (never fabricated)."""
    # _make_response gives smiles="C0" and inchi_key="" -> InChI-less path.
    response = _make_response("no_inchi.cdx", inchi_keys=[""])
    await save_extraction(db_session, response)

    rows = (
        await db_session.scalars(
            select(Substance).where(Substance.dedup_key == make_dedup_key("C0"))
        )
    ).all()
    assert len(rows) == 1, "InChI-less substance with a SMILES must be stored"
    assert rows[0].inchi_key == "", "inchi_key must never carry a fabricated value"


@pytest.mark.asyncio
async def test_save_extraction_skips_substance_with_no_identity(db_session):
    """A substance with neither an InChIKey nor a SMILES has no identity and is
    dropped (nothing to deduplicate on)."""
    response = _make_response("empty.cdx", inchi_keys=[""])
    response.substances[0].smiles = ""  # no key AND no smiles
    # save_extraction commits to a session-scoped DB, so count the delta
    # rather than asserting an absolute (order-independent).
    before = await db_session.scalar(select(func.count()).select_from(Substance))
    extraction = await save_extraction(db_session, response)
    after = await db_session.scalar(select(func.count()).select_from(Substance))

    assert after == before, "A substance with no identity must not be inserted"
    assert extraction.id is not None


@pytest.mark.asyncio
async def test_delete_extraction_removes_orphaned_substances(db_session):
    """HIST-01: deleting an extraction removes orphaned substances."""
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
    """Shared substance (referenced by another extraction) is not deleted."""
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
    """enforce_cap deletes oldest extractions when count exceeds max_count."""
    for i in range(5):
        await save_extraction(
            db_session,
            _make_response(f"cap{i}.cdx", inchi_keys=[_make_key("E", i)]),
        )
    await enforce_cap(db_session, max_count=3)

    result = await db_session.execute(select(Extraction))
    remaining = result.scalars().all()
    assert len(remaining) <= 3, f"Expected at most 3 extractions, got {len(remaining)}"


def _response_with_svg(filename: str, key: str, svg: str, svg_cdx: str):
    """ExtractionResponse for one substance with explicit svg / svg_cdx."""
    return ExtractionResponse(
        substances=[
            SubstanceResponse(
                inchi_key=key,
                inchi="InChI=1S/test",
                smiles="C1CC1",
                molecular_formula="C3H6",
                svg=svg,
                svg_cdx=svg_cdx,
            )
        ],
        info=SubstanceInfoResponse(no_substances=1),
        format="cdx",
        filename=filename,
        file_size=100,
        structure_count=1,
        extraction_time_ms=50.0,
        warnings=[],
    )


async def _stored_svgs(db_session, key: str) -> tuple[str, str]:
    row = (
        await db_session.execute(
            select(Substance.svg, Substance.svg_cdx).where(Substance.inchi_key == key)
        )
    ).one()
    return row[0], row[1]


@pytest.mark.asyncio
async def test_reextraction_heals_a_blank_svg_row(db_session):
    """A substance first persisted blank (render OOM'd in an earlier deploy) is
    healed when a later extraction supplies a good SVG — the reported
    "big molecule never renders even after re-upload" bug.

    Before the fix, ON CONFLICT DO NOTHING kept the blank row and discarded the
    good SVG on every re-upload; the row served a blank image forever.
    """
    key = _make_key("H")  # real key -> dedup_key == inchi_key here
    # 1st upload: render failed -> persisted blank.
    await save_extraction(db_session, _response_with_svg("blank.cdx", key, "", ""))
    assert await _stored_svgs(db_session, key) == ("", "")

    # 2nd upload: render succeeded -> must heal the blank row in place.
    await save_extraction(
        db_session,
        _response_with_svg("good.cdx", key, "<svg>ok</svg>", "<svg>cdx</svg>"),
    )
    assert await _stored_svgs(db_session, key) == ("<svg>ok</svg>", "<svg>cdx</svg>")


@pytest.mark.asyncio
async def test_reextraction_never_clobbers_a_good_svg(db_session):
    """The heal only fills blanks — a good stored SVG is never overwritten by a
    later extraction (even one that itself rendered), so first-good-render wins.
    """
    key = _make_key("I")
    await save_extraction(
        db_session,
        _response_with_svg("first.cdx", key, "<svg>GOOD</svg>", "<svg>GOODC</svg>"),
    )
    # A later extraction with a *different* (or empty) render must not overwrite.
    await save_extraction(
        db_session, _response_with_svg("second.cdx", key, "<svg>OTHER</svg>", "")
    )
    assert await _stored_svgs(db_session, key) == (
        "<svg>GOOD</svg>",
        "<svg>GOODC</svg>",
    )
