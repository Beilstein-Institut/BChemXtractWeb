"""Export endpoint — POST /api/export.

Accepts substance IDs (or extraction_id for Export All) + format string.
Generates file server-side, returns StreamingResponse for browser download.

Per D-08: single unified endpoint for all formats.
Per D-11: RXN format built now but returns empty stub until Phase 10.
Per security:
  T-08-01: Pydantic validates format as Literal (unknown values return 422).
  T-08-04: ZIP filenames sanitized in export service against path traversal.
  T-08-05: PNG limit enforced in export service (400 for > 200 structures).
"""

import io
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chemistry import ExportRequest
from app.models.orm import Extraction, ExtractionSubstance, Substance
from app.services.db import get_db
from app.services.export import generate_export

logger = logging.getLogger(__name__)
router = APIRouter(tags=["export"])

DbDep = Annotated[AsyncSession, Depends(get_db)]

_EXPORT_SIZE_WARN_BYTES = 50 * 1024 * 1024  # 50 MB log threshold


async def _fetch_substances(payload: ExportRequest, db: AsyncSession) -> list[dict]:
    """Fetch substance dicts for the export request.

    If substance_ids is non-empty, fetch those specific substances.
    If substance_ids is empty and extraction_id is set, fetch all substances
    for that extraction in position order (D-03 Export All).

    Args:
        payload: Validated ExportRequest with format, substance_ids, extraction_id.
        db: Async database session.

    Returns:
        List of substance dicts ready for the export generators.

    Raises:
        HTTPException 400: Neither substance_ids nor extraction_id provided.
        HTTPException 404: Extraction not found or yields no substances.
    """
    if payload.substance_ids:
        # CR-01: Join through ExtractionSubstance to prevent IDOR — callers must
        # not be able to export substance rows from arbitrary extractions by
        # guessing integer IDs.  When extraction_id is present (the normal case
        # for D-01/D-02 selection flows), restrict to substances that belong to
        # that extraction.  When extraction_id is absent, still require that the
        # substance is linked to *some* extraction (prevents orphaned-row leakage).
        stmt = (
            select(Substance)
            .join(ExtractionSubstance, Substance.id == ExtractionSubstance.substance_id)
            .where(Substance.id.in_(payload.substance_ids))
        )
        if payload.extraction_id is not None:
            stmt = stmt.where(
                ExtractionSubstance.extraction_id == payload.extraction_id
            )
        result = await db.execute(stmt)
        substances = result.scalars().all()
    elif payload.extraction_id is not None:
        # Verify extraction exists
        ext_result = await db.execute(
            select(Extraction).where(Extraction.id == payload.extraction_id)
        )
        extraction = ext_result.scalar_one_or_none()
        if extraction is None:
            raise HTTPException(status_code=404, detail="Extraction not found")

        result = await db.execute(
            select(Substance)
            .join(
                ExtractionSubstance,
                Substance.id == ExtractionSubstance.substance_id,
            )
            .where(ExtractionSubstance.extraction_id == payload.extraction_id)
            .order_by(ExtractionSubstance.position)
        )
        substances = result.scalars().all()
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide substance_ids or extraction_id",
        )

    if not substances:
        raise HTTPException(status_code=404, detail="No substances found for export")

    return [
        {
            "id": s.id,
            "inchi_key": s.inchi_key,
            "inchi": s.inchi,
            "smiles": s.smiles,
            "extended_smiles": s.extended_smiles,
            "molecular_formula": s.molecular_formula,
            "svg": s.svg,
            "mdlv3000": s.mdlv3000,
            # iupac_name is not stored on Substance ORM; included in JSON/CSV as empty
            "iupac_name": "",
        }
        for s in substances
    ]


@router.post("/export")
async def export_substances(
    payload: ExportRequest,
    db: DbDep,
) -> StreamingResponse:
    """Generate and stream a chemical export file.

    payload.substance_ids: list of Substance.id values (D-01, D-02, D-04).
    payload.extraction_id: export all substances from extraction (D-03).
    payload.format: "sdf" | "json" | "csv" | "png" | "svg" | "cml" | "v3000" | "rxn"

    Returns StreamingResponse with appropriate Content-Type and Content-Disposition.

    Raises:
        HTTPException 400: No IDs provided, or PNG export > 200 structures.
        HTTPException 404: Extraction/substances not found.
        HTTPException 422: Invalid format (Pydantic catches this before handler).
    """
    substance_dicts = await _fetch_substances(payload, db)

    content, media_type, filename = await generate_export(substance_dicts, payload.format)

    if len(content) > _EXPORT_SIZE_WARN_BYTES:
        logger.warning(
            "Large export: format=%s size=%d bytes count=%d",
            payload.format,
            len(content),
            len(substance_dicts),
        )

    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
