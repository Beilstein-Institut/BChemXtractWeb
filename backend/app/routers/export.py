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
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.middleware.rate_limit import limiter
from app.models.chemistry import ErrorResponse, ExportRequest
from app.models.orm import (
    Extraction,
    ExtractionReaction,
    ExtractionSubstance,
    Reaction,
    Substance,
)
from app.services.db import get_db
from app.services.export import generate_export, generate_reactions_export

logger = logging.getLogger(__name__)
router = APIRouter()

DbDep = Annotated[AsyncSession, Depends(get_db)]

_EXPORT_SIZE_WARN_BYTES = 50 * 1024 * 1024  # 50 MB log threshold
# SEC H-06: enforced output cap. One request cannot stream more than
# 500 MB regardless of how many IDs are requested — if an attacker finds
# a way past the Pydantic ``max_length`` bounds on ``substance_ids``, the
# generator output is still gated here. 500 MB leaves ample headroom for
# a legitimate 1000-structure SDF + SVG export.
_EXPORT_SIZE_HARD_LIMIT_BYTES = 500 * 1024 * 1024


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
            .distinct()
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


async def _fetch_reactions(
    payload: ExportRequest, db: AsyncSession
) -> list[dict]:
    """Fetch reaction dicts for RXN export. IDOR-safe (Plan 10 T-10-04).

    Mirrors _fetch_substances IDOR protection:
      - Explicit reaction_ids + extraction_id -> JOIN through ExtractionReaction
        with extraction_id scope
      - extraction_id only -> all reactions linked to that extraction in position order
      - Neither -> 400
    """
    if payload.reaction_ids:
        stmt = (
            select(Reaction)
            .join(
                ExtractionReaction,
                Reaction.id == ExtractionReaction.reaction_id,
            )
            .where(Reaction.id.in_(payload.reaction_ids))
            .distinct()
        )
        if payload.extraction_id is not None:
            stmt = stmt.where(
                ExtractionReaction.extraction_id == payload.extraction_id
            )
        result = await db.execute(stmt)
        reactions = result.scalars().all()
    elif payload.extraction_id is not None:
        ext_result = await db.execute(
            select(Extraction).where(Extraction.id == payload.extraction_id)
        )
        if ext_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=404, detail="Extraction not found"
            )
        result = await db.execute(
            select(Reaction)
            .join(
                ExtractionReaction,
                Reaction.id == ExtractionReaction.reaction_id,
            )
            .where(ExtractionReaction.extraction_id == payload.extraction_id)
            .order_by(ExtractionReaction.position)
        )
        reactions = result.scalars().all()
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide reaction_ids or extraction_id for RXN export.",
        )

    if not reactions:
        raise HTTPException(
            status_code=404, detail="No reactions found for export."
        )

    return [
        {
            "id": r.id,
            "long_rinchi_key": r.long_rinchi_key,
            "reaction_smiles": r.reaction_smiles,
            "rinchi": r.rinchi,
            "aux_info": r.aux_info,
            "svg": r.svg,
            "components": r.components,
        }
        for r in reactions
    ]


@router.post(
    "/export",
    operation_id="exportSubstances",
    summary="Export substances in the chosen chemical format",
    description=(
        "Generate a downloadable file containing one or more substances. "
        "Supply either a `substance_ids` list (explicit selection per "
        "D-01/D-02/D-04) or an `extraction_id` (D-03 Export All); setting "
        "both restricts the selection to the intersection for IDOR safety "
        "(CR-01). Supported formats: `sdf`, `json`, `csv`, `png`, `svg`, "
        "`cml`, `v3000`, and `rxn` (stub until Phase 10 per D-11)."
    ),
    responses={
        200: {
            "description": (
                "Export streamed back. Media type and `Content-Disposition` "
                "filename depend on the chosen format."
            ),
        },
        400: {
            "model": ErrorResponse,
            "description": (
                "Neither `substance_ids` nor `extraction_id` was supplied, "
                "or PNG export request exceeded the 200-structure cap."
            ),
        },
        404: {
            "model": ErrorResponse,
            "description": "Extraction id or substances not found.",
        },
        422: {
            "model": ErrorResponse,
            "description": "Invalid format literal or malformed request body.",
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["export"],
)
@limiter.limit(settings.rate_limit_export)
async def export_substances(
    request: Request,
    payload: ExportRequest,
    db: DbDep,
) -> StreamingResponse:
    """Generate and stream a chemical export file.

    payload.substance_ids: list of Substance.id values (D-01, D-02, D-04).
    payload.extraction_id: export all substances from extraction (D-03).
    payload.format: "sdf" | "json" | "csv" | "png" | "svg" | "cml" | "v3000" | "rxn"

    Plan 10 EXPO-08: when payload.format == "rxn", dispatch to
    _fetch_reactions + generate_reactions_export instead of the substance
    pipeline. generate_export no longer has an "rxn" branch -- the router
    intercepts rxn here, ensuring substance and reaction paths stay
    disjoint.

    Returns StreamingResponse with appropriate Content-Type and Content-Disposition.

    Raises:
        HTTPException 400: No IDs provided, or PNG export > 200 structures.
        HTTPException 404: Extraction/substances not found.
        HTTPException 422: Invalid format (Pydantic catches this before handler).
    """
    # Plan 10 EXPO-08: rxn format routes through the reactions path.
    # This dispatch MUST run before _fetch_substances / generate_export,
    # because generate_export no longer has an "rxn" branch -- substance
    # path is substance-only.
    if payload.format == "rxn":
        reaction_dicts = await _fetch_reactions(payload, db)
        content, media_type, filename = await generate_reactions_export(
            reaction_dicts, payload.format
        )
        if len(content) > _EXPORT_SIZE_HARD_LIMIT_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Export payload exceeds the "
                    f"{_EXPORT_SIZE_HARD_LIMIT_BYTES // (1024 * 1024)} MB "
                    f"limit. Narrow the selection and retry."
                ),
            )
        if len(content) > _EXPORT_SIZE_WARN_BYTES:
            logger.warning(
                "Large export: format=%s size=%d bytes count=%d",
                payload.format,
                len(content),
                len(reaction_dicts),
            )
        safe_name = filename.replace('"', "").replace("\n", "").replace("\r", "")
        encoded_name = quote(filename, safe="")
        return StreamingResponse(
            io.BytesIO(content),
            media_type=media_type,
            headers={
                "Content-Disposition": (
                    f'attachment; filename="{safe_name}"; '
                    f"filename*=UTF-8''{encoded_name}"
                )
            },
        )

    # Existing substance path (unchanged -- generate_export is substance-only)
    substance_dicts = await _fetch_substances(payload, db)

    content, media_type, filename = await generate_export(substance_dicts, payload.format)

    if len(content) > _EXPORT_SIZE_HARD_LIMIT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Export payload exceeds the "
                f"{_EXPORT_SIZE_HARD_LIMIT_BYTES // (1024 * 1024)} MB "
                f"limit. Narrow the selection and retry."
            ),
        )
    if len(content) > _EXPORT_SIZE_WARN_BYTES:
        logger.warning(
            "Large export: format=%s size=%d bytes count=%d",
            payload.format,
            len(content),
            len(substance_dicts),
        )

    # WR-01: RFC 6266-compliant Content-Disposition — strip control characters
    # from the ASCII fallback and provide a percent-encoded filename* parameter
    # so filenames with non-ASCII or special characters are handled correctly.
    safe_name = filename.replace('"', "").replace("\n", "").replace("\r", "")
    encoded_name = quote(filename, safe="")
    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="{safe_name}"; '
                f"filename*=UTF-8''{encoded_name}"
            )
        },
    )
