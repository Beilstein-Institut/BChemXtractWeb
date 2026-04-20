"""History and statistics endpoints (Phase 5).

Endpoints:
  GET  /api/history             — list recent extractions (D-04, D-05)
  GET  /api/history/{id}        — reload one extraction's full result (D-06, HIST-02)
  DELETE /api/history/{id}      — delete one extraction (D-07)
  GET  /api/stats               — aggregate statistics (D-08, HIST-04)
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
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
from app.models.orm import Extraction, Substance
from app.services.db import get_db
from app.services.persistence import delete_extraction_by_id

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
async def delete_history_entry(extraction_id: int, db: DbDep) -> None:
    """Delete one extraction record and clean up orphaned substances (D-07).

    Args:
        extraction_id: Primary key of the Extraction record.
        db: AsyncSession from get_db() dependency.

    Raises:
        HTTPException 404: If the extraction_id does not exist.
    """
    deleted = await delete_extraction_by_id(db, extraction_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Extraction not found")


@router.get(
    "/stats",
    response_model=StatsResponse,
    operation_id="getStats",
    summary="Aggregate statistics across all extractions",
    description=(
        "Return total extraction count, unique-substance count (by InChI "
        "key), and the most frequently occurring molecular formula across "
        "the entire store (HIST-04, D-08). `most_common_formula` is `\"\"` "
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
    total_extractions = await db.scalar(
        select(func.count()).select_from(Extraction)
    ) or 0

    unique_structures = await db.scalar(
        select(func.count()).select_from(Substance)
    ) or 0

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
