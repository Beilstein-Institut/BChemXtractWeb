"""History and statistics endpoints (Phase 5).

Endpoints:
  GET  /api/history             — list recent extractions (D-04, D-05)
  GET  /api/history/{id}        — reload one extraction's full result (D-06, HIST-02)
  DELETE /api/history/{id}      — delete one extraction (D-07)
  GET  /api/stats               — aggregate statistics (D-08, HIST-04)
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.chemistry import (
    ErrorResponse,
    ExtractionResponse,
    HistoryListItem,
    HistoryListResponse,
    StatsResponse,
    SubstanceInfoResponse,
    SubstanceResponse,
)
from app.models.orm import (
    Extraction,
    ExtractionReaction,
    ExtractionSubstance,
    Reaction,
    Substance,
)
from app.services.audit import audit_log_insert_in_session
from app.services.db import get_db
from app.services.persistence import update_substance_svgs
from app.services.svg_backfill import render_svgs_from_mdlv3000

logger = logging.getLogger(__name__)

router = APIRouter()

DbDep = Annotated[AsyncSession, Depends(get_db)]

DEFAULT_HISTORY_LIMIT = 10


def _extraction_to_list_item(e: Extraction) -> HistoryListItem:
    """Convert an Extraction ORM row to a HistoryListItem Pydantic model."""
    return HistoryListItem(
        id=e.id,
        filename=e.filename,
        file_size=e.file_size,
        format=e.format,
        structure_count=e.structure_count,
        reaction_count=e.reaction_count,  # Plan 10 D-23 — bridges ORM column to wire
        extraction_time_ms=e.extraction_time_ms,
        warnings=e.warnings or [],
        created_at=e.created_at.isoformat(),
    )


async def _backfill_missing_svgs(db: AsyncSession, substances: list[Substance]) -> None:
    """Render + persist any substance rows with empty svg / svg_cdx.

    Best-effort. Commits after each successful UPDATE so one broken row
    doesn't block others. Failures are logged and swallowed so the
    history view always returns.

    Note: we do NOT touch ``s.svg`` / ``s.svg_cdx`` on the ORM object.
    SQLAlchemy's autoflush would otherwise race-overwrite the raw-SQL
    UPDATE's conditional ``CASE WHEN col = '' THEN :val ELSE col END``
    guard (the ORM's dirty-attribute UPDATE has no such guard and would
    unconditionally clobber a concurrent winner's value). Instead,
    ``update_substance_svgs`` is the sole writer and ``db.refresh(s)``
    pulls the authoritative post-transaction value back into the ORM
    object for ``_extraction_to_response`` to serialize.
    """
    for s in substances:
        if s.svg and s.svg_cdx:
            continue
        filled = await render_svgs_from_mdlv3000(s)
        if not filled.changed:
            continue
        try:
            await update_substance_svgs(db, s.id, filled.svg, filled.svg_cdx)
            await db.commit()
            await db.refresh(s)
        except Exception:  # noqa: BLE001 — self-heal is best-effort
            logger.exception("SVG backfill persist failed for substance %s", s.id)
            await db.rollback()


def _extraction_to_response(e: Extraction) -> ExtractionResponse:
    """Convert an Extraction ORM row (with loaded substances) to ExtractionResponse.

    Returns the same shape as POST /api/extract so the frontend can pass it
    directly to StructureGrid and ExtractionSummary (D-06, Pattern 6).
    """
    substances = [
        SubstanceResponse(
            id=s.id,
            inchi_key=s.inchi_key,
            inchi=s.inchi,
            smiles=s.smiles,
            extended_smiles=s.extended_smiles,
            molecular_formula=s.molecular_formula,
            svg=s.svg,
            svg_cdx=s.svg_cdx,
            mdlv3000=s.mdlv3000,
        )
        for s in (e.substances or [])
    ]
    return ExtractionResponse(
        substances=substances,
        info=SubstanceInfoResponse(
            no_fragments=0,
            no_inchis=len(substances),
            no_substances=len(substances),
        ),
        format=e.format,
        filename=e.filename,
        file_size=e.file_size,
        structure_count=e.structure_count,
        extraction_time_ms=e.extraction_time_ms,
        warnings=e.warnings or [],
        extraction_id=e.id,
    )


@router.get(
    "/history",
    response_model=HistoryListResponse,
    operation_id="listHistory",
    summary="List recent extractions",
    description=(
        "Return a paginated list of past extractions ordered newest-first. "
        "Pass `limit=all` to return every stored extraction (capped at 500 "
        "per D-10). Integer limits are clamped to the DEFAULT_HISTORY_LIMIT "
        "if invalid."
    ),
    responses={
        200: {
            "description": "List of extraction summaries (newest first).",
            "content": {
                "application/json": {
                    "example": {
                        "items": [
                            {
                                "id": 42,
                                "filename": "aromatics.cdx",
                                "file_size": 4823,
                                "format": "cdx",
                                "structure_count": 12,
                                # Plan 10 D-23 — populated by save_reactions
                                "reaction_count": 3,
                                "extraction_time_ms": 412.3,
                                "warnings": [],
                                "created_at": "2026-04-17T09:12:44+00:00",
                            }
                        ],
                        "total": 42,
                    }
                }
            },
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["history"],
)
async def list_history(
    db: DbDep,
    limit: str = str(DEFAULT_HISTORY_LIMIT),
) -> HistoryListResponse:
    """List recent extractions ordered newest-first.

    Args:
        db: AsyncSession from get_db() dependency.
        limit: Number of entries to return. Use "all" to return every entry (D-05).

    Returns:
        HistoryListResponse with items list and total count.
    """
    total_result = await db.scalar(select(func.count()).select_from(Extraction))
    total = total_result or 0

    query = (
        select(Extraction)
        .options(selectinload(Extraction.substances))
        .order_by(Extraction.created_at.desc())
    )
    if limit != "all":
        try:
            n = int(limit)
        except ValueError:
            n = DEFAULT_HISTORY_LIMIT
        query = query.limit(n)

    result = await db.execute(query)
    extractions = result.scalars().all()

    return HistoryListResponse(
        items=[_extraction_to_list_item(e) for e in extractions],
        total=total,
    )


@router.get(
    "/history/{extraction_id}",
    response_model=ExtractionResponse,
    operation_id="getHistoryDetail",
    summary="Full extraction detail by id",
    description=(
        "Return the full extraction result for one history entry, matching "
        "the `POST /api/extract` response shape so the frontend can hand "
        "it directly to StructureGrid / ExtractionSummary without format "
        "translation (HIST-02, D-06)."
    ),
    responses={
        200: {"description": "Extraction found; full detail returned."},
        404: {"model": ErrorResponse, "description": "Extraction id not found."},
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["history"],
)
async def get_history_detail(extraction_id: int, db: DbDep) -> ExtractionResponse:
    """Return full extraction result for one history entry (HIST-02, D-06).

    The response shape matches POST /api/extract so the frontend can pass it
    directly to StructureGrid without any format translation.

    Side-effect: rows whose ``svg`` or ``svg_cdx`` is empty get rendered
    from the stored MDL V3000 molblock and persisted on first view
    (self-healing for pre-dual-render rows). Best-effort — per-substance
    backfill failures are logged and skipped so the response still
    returns the extraction.

    Args:
        extraction_id: Primary key of the Extraction record.
        db: AsyncSession from get_db() dependency.

    Returns:
        ExtractionResponse with substances populated from the DB join.

    Raises:
        HTTPException 404: If the extraction_id does not exist.
    """
    result = await db.execute(
        select(Extraction)
        .options(selectinload(Extraction.substances))
        .where(Extraction.id == extraction_id)
    )
    extraction = result.scalar_one_or_none()
    if extraction is None:
        raise HTTPException(status_code=404, detail="Extraction not found")

    await _backfill_missing_svgs(db, extraction.substances or [])

    return _extraction_to_response(extraction)


@router.delete(
    "/history/{extraction_id}",
    status_code=204,
    operation_id="deleteHistoryEntry",
    summary="Delete an extraction",
    description=(
        "Delete one extraction record. Orphaned substances (those no longer "
        "linked to any extraction) are cleaned up as well (D-07). Returns "
        "204 No Content on success."
    ),
    responses={
        204: {"description": "Extraction deleted."},
        404: {"model": ErrorResponse, "description": "Extraction id not found."},
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["history"],
)
async def delete_history_entry(extraction_id: int, request: Request, db: DbDep) -> None:
    """Delete one extraction record and clean up orphaned substances (D-07).

    Phase 11 D-16: emits ``extraction.deleted`` via
    ``audit_log_insert_in_session`` BEFORE the commit so the audit row
    and the deletion are atomic — same Pitfall #6 contract as
    ``DELETE /api/me/data``.

    Args:
        extraction_id: Primary key of the Extraction record.
        request: FastAPI Request — used to read ``request.state.scope``
            and to populate the audit row's IP/user-agent.
        db: AsyncSession from get_db() dependency.

    Raises:
        HTTPException 404: If the extraction_id does not exist.
    """
    # Read the scope set by get_scoped_db (Phase 11 Wave 2). Fallback to
    # (None, None) for the legacy code path / direct-call unit tests.
    session_id, api_key_hash = (
        request.state.scope if hasattr(request.state, "scope") else (None, None)
    )

    extraction = await db.get(Extraction, extraction_id)
    if extraction is None:
        raise HTTPException(status_code=404, detail="Extraction not found")

    await db.delete(extraction)
    await db.flush()

    # Orphan sweep (D-07 / Plan 10 D-21) — same pattern as
    # services.persistence.delete_extraction_by_id, inlined here so the
    # audit row lands in the same transaction.
    await db.execute(
        delete(Substance).where(
            Substance.id.not_in(select(ExtractionSubstance.substance_id))
        )
    )
    await db.execute(
        delete(Reaction).where(
            Reaction.id.not_in(select(ExtractionReaction.reaction_id))
        )
    )

    # Phase 11 D-16: in-transaction audit emit. If the audit insert
    # fails, the entire DELETE rolls back atomically (Pitfall #6).
    await audit_log_insert_in_session(
        db,
        event="extraction.deleted",
        session_id=session_id,
        api_key_hash=api_key_hash,
        target_id=str(extraction_id),
        request=request,
        meta={},
    )

    await db.commit()


@router.get(
    "/stats",
    response_model=StatsResponse,
    operation_id="getStats",
    summary="Aggregate statistics across all extractions",
    description=(
        "Return total extraction count, unique-substance count (by InChI "
        "key), and the most frequently occurring molecular formula across "
        'the entire store (HIST-04, D-08). `most_common_formula` is `""` '
        "when no substances exist."
    ),
    responses={
        200: {
            "description": "Aggregate statistics computed successfully.",
            "content": {
                "application/json": {
                    "example": {
                        "total_extractions": 120,
                        "unique_structures": 842,
                        "most_common_formula": "C6H6",
                    }
                }
            },
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["history"],
)
async def get_stats(db: DbDep) -> StatsResponse:
    """Return aggregate statistics across all stored data (HIST-04, D-08).

    Returns:
        StatsResponse with total_extractions, unique_structures, most_common_formula.
        most_common_formula is "" when no substances exist.
    """
    total_extractions = (
        await db.scalar(select(func.count()).select_from(Extraction)) or 0
    )

    unique_structures = (
        await db.scalar(select(func.count()).select_from(Substance)) or 0
    )

    formula_result = await db.execute(
        select(Substance.molecular_formula, func.count().label("n"))
        .where(Substance.molecular_formula != "")
        .group_by(Substance.molecular_formula)
        .order_by(func.count().desc())
        .limit(1)
    )
    formula_row = formula_result.first()
    most_common_formula = formula_row[0] if formula_row else ""

    return StatsResponse(
        total_extractions=total_extractions,
        unique_structures=unique_structures,
        most_common_formula=most_common_formula,
    )
