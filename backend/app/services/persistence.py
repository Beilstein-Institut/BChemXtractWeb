"""Persistence service: save extractions to PostgreSQL with deduplication (Phase 5).

All three public functions accept an AsyncSession from get_db() or a test fixture.
save_extraction() and delete_extraction_by_id() call db.commit() internally.
enforce_cap() also commits internally as a housekeeping step.
"""

import logging

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chemistry import ExtractionResponse
from app.models.orm import Extraction, ExtractionSubstance, Substance

logger = logging.getLogger(__name__)

MAX_EXTRACTIONS = 500
"""Retention cap per D-10: oldest extraction auto-deleted when limit is reached."""


async def save_extraction(
    db: AsyncSession,
    response: ExtractionResponse,
) -> Extraction:
    """Persist one extraction result and deduplicate its substances.

    Steps:
      1. Insert an Extraction row.
      2. Upsert each Substance via ON CONFLICT (inchi_key) DO NOTHING (D-02).
      3. Fetch IDs for all substances (new + existing) by inchi_key.
      4. Insert ExtractionSubstance join rows.
      5. Commit and refresh.
      6. Enforce 500-record cap (D-10).

    Args:
        db: AsyncSession from get_db() dependency.
        response: ExtractionResponse from the extraction pipeline.

    Returns:
        The newly created Extraction ORM instance with id populated.
    """
    # Step 1: Insert Extraction row
    extraction = Extraction(
        filename=response.filename,
        file_size=response.file_size,
        format=response.format,
        structure_count=response.structure_count,
        extraction_time_ms=response.extraction_time_ms,
        warnings=response.warnings,
    )
    db.add(extraction)
    await db.flush()  # get extraction.id without committing

    # Step 2: Build substance data — skip entries with empty inchi_key
    valid_substances = [s for s in response.substances if s.inchi_key]
    if valid_substances:
        substance_data = [
            {
                "inchi_key": s.inchi_key,
                "inchi": s.inchi,
                "smiles": s.smiles,
                "extended_smiles": s.extended_smiles,
                "molecular_formula": s.molecular_formula,
                "svg": s.svg,
                "mdlv3000": s.mdlv3000,
            }
            for s in valid_substances
        ]
        # ON CONFLICT DO NOTHING: first-seen metadata wins (D-02)
        await db.execute(
            pg_insert(Substance)
            .values(substance_data)
            .on_conflict_do_nothing(index_elements=["inchi_key"])
        )

        # Step 3: Fetch IDs for all substances (new + pre-existing)
        inchi_keys = [s.inchi_key for s in valid_substances]
        result = await db.execute(
            select(Substance.id).where(Substance.inchi_key.in_(inchi_keys))
        )
        substance_ids = result.scalars().all()

        # Step 4: Insert join rows (ignore duplicates — re-extracting same file)
        if substance_ids:
            join_data = [
                {"extraction_id": extraction.id, "substance_id": sid}
                for sid in substance_ids
            ]
            await db.execute(
                pg_insert(ExtractionSubstance)
                .values(join_data)
                .on_conflict_do_nothing()
            )

    await db.commit()
    await db.refresh(extraction)

    # Step 6: Enforce retention cap (D-10) — separate transaction
    await enforce_cap(db)

    return extraction


async def enforce_cap(db: AsyncSession, max_count: int = MAX_EXTRACTIONS) -> None:
    """Delete oldest extractions when count exceeds max_count, then orphan-clean.

    Inline cleanup per D-10: no trigger, no scheduled task. Runs after every
    successful save_extraction(). Safe to call when count is within cap.

    Args:
        db: AsyncSession from get_db() dependency.
        max_count: Maximum number of extractions to keep. Default 500 (D-10).
    """
    total = await db.scalar(select(func.count()).select_from(Extraction))
    if total is None or total <= max_count:
        return

    # Keep the most recent max_count extractions; delete the rest
    keep_subq = (
        select(Extraction.id)
        .order_by(Extraction.created_at.desc())
        .limit(max_count)
        .subquery()
    )
    await db.execute(
        delete(Extraction).where(Extraction.id.not_in(select(keep_subq.c.id)))
    )

    # Delete orphaned substances (no remaining extraction_substances link)
    await db.execute(
        delete(Substance).where(
            Substance.id.not_in(select(ExtractionSubstance.substance_id))
        )
    )

    await db.commit()
    logger.info(
        "enforce_cap: trimmed to %d extractions, removed orphaned substances",
        max_count,
    )


async def delete_extraction_by_id(db: AsyncSession, extraction_id: int) -> bool:
    """Delete a single extraction record and clean up orphaned substances.

    The CASCADE FK on extraction_substances.extraction_id removes join rows.
    After deletion, substances with no remaining links are removed (D-07).

    Args:
        db: AsyncSession from get_db() dependency.
        extraction_id: Primary key of the Extraction to delete.

    Returns:
        True if the extraction existed and was deleted, False if not found.
    """
    extraction = await db.get(Extraction, extraction_id)
    if extraction is None:
        return False

    await db.delete(extraction)
    await db.flush()

    # Remove orphaned substances (no remaining extraction_substances rows)
    await db.execute(
        delete(Substance).where(
            Substance.id.not_in(select(ExtractionSubstance.substance_id))
        )
    )

    await db.commit()
    return True
