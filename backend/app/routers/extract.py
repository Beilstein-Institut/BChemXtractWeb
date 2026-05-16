"""Single-file extraction endpoint for CDX/CDXML uploads.

POST /api/extract accepts a ChemDraw file via multipart/form-data, detects
the format from content (D-06), extracts substances with SVG depictions,
and returns ExtractionResponse JSON with metadata and optional warnings.
"""

import asyncio
import logging
import math
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.middleware.rate_limit import limiter
from app.models.chemistry import (
    ErrorResponse,
    ExtractionResponse,
    PagedSubstancesResponse,
    SubstanceResponse,
)
from app.models.orm import Extraction, ExtractionSubstance, Substance
from app.routers._shared import check_extension_mismatch
from app.services.db import get_scoped_db
from app.services.extractor import extract_substances_with_svg
from app.services.format_detector import detect_format
from app.services.persistence import save_extraction
from app.services.upload_guard import read_upload_bounded

logger = logging.getLogger(__name__)

router = APIRouter()

DbDep = Annotated[AsyncSession, Depends(get_scoped_db)]


@router.post(
    "/extract",
    response_model=ExtractionResponse,
    operation_id="extractFile",
    summary="Extract substances from a CDX/CDXML file",
    description=(
        "Synchronous single-file extraction. The backend detects CDX vs "
        "CDXML from the file's content (magic bytes `VjCD` for binary CDX) "
        "and routes to the matching CDK reader. Returns the full "
        "ExtractionResponse including inline SVG depictions. Auto-persists "
        "to PostgreSQL — `extraction_id` is set on the response when the "
        "save succeeds (best-effort; a save failure is logged but does "
        "not fail the extraction)."
    ),
    responses={
        200: {"description": "Extraction complete."},
        413: {
            "model": ErrorResponse,
            "description": "File exceeds the upload size limit.",
        },
        415: {
            "model": ErrorResponse,
            "description": "Unrecognized file format (not CDX or CDXML).",
        },
        422: {
            "model": ErrorResponse,
            "description": "CDK could not parse the file.",
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["extraction"],
)
@limiter.limit(settings.rate_limit_upload)
async def extract_file(
    request: Request, file: UploadFile, db: DbDep
) -> ExtractionResponse:
    """Extract chemical substances from a CDX/CDXML file upload.

    Accepts a single file via multipart/form-data. Detects format from
    content (D-06), extracts substances with SVG depictions, and returns
    a structured response with metadata and optional warnings.
    """
    # D-05 + SEC M-02: bounded streaming read aborts the body scan the
    # moment accumulated bytes exceed ``max_upload_size`` even when the
    # client omits Content-Length or uses chunked transfer encoding.
    file_bytes = await read_upload_bounded(file, settings.max_upload_size)

    start = time.perf_counter()

    # D-06: Content-based format detection is authoritative.
    format_type = detect_format(file_bytes)

    # D-07: Extension mismatch is a warning, not an error.
    warnings: list[str] = []
    if file.filename:
        warnings.extend(check_extension_mismatch(file.filename, format_type))

    # D-08/D-01: substances only (reactions are Phase 10); SVGs inline.
    # extract_substances_with_svg handles fallback internally and returns
    # extraction-level warnings (e.g. fallback mode, no InChI).
    substances, info, extraction_warnings = await extract_substances_with_svg(
        file_bytes, format_type
    )
    warnings.extend(extraction_warnings)

    elapsed_ms = (time.perf_counter() - start) * 1000

    response = ExtractionResponse(
        substances=substances,
        info=info,
        format=format_type,
        filename=file.filename or "",
        file_size=len(file_bytes),
        structure_count=len(substances),
        extraction_time_ms=round(elapsed_ms, 1),
        warnings=warnings,
    )

    # D-03: auto-persist every extraction. Best-effort — DB failures are
    # logged but never break extraction. CancelledError re-raises so
    # graceful shutdown and client-disconnect handling still work
    # (SEC M-05). Filename is repr-wrapped + truncated to prevent
    # log-injection via crafted names (e.g. ``"x\n[CRITICAL] fake"``).
    try:
        # Phase 11 D-01: thread the scoped dependency's resolved
        # (session_id, api_key_hash) tuple through to save_extraction so
        # the inserted rows carry the owner columns RLS reads from.
        # get_scoped_db (added to the global dep stack in main.py for every
        # protected router) populates request.state.scope before the
        # handler runs; the fallback default is the un-scoped tuple so
        # routes still work in unit-test contexts that bypass the dep.
        scope = request.state.scope if hasattr(request.state, "scope") else (None, None)
        saved = await save_extraction(db, response, scope=scope)
        response = response.model_copy(update={"extraction_id": saved.id})
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception(
            "Auto-persist failed for filename=%r — extraction result still returned",
            (file.filename or "")[:100],
        )

    return response


@router.get(
    "/extractions/{extraction_id}/substances",
    response_model=PagedSubstancesResponse,
    operation_id="getExtractionSubstances",
    summary="Paginated substances for one extraction",
    description=(
        "Return a paginated slice of substances belonging to a single "
        "extraction (D-01, DISP-03). `page` is 1-based; `size` is clamped "
        "to 1-48 (default 12). `sort` accepts `extraction_order` (default) "
        "or `formula`."
    ),
    responses={
        200: {"description": "Paginated substances returned."},
        404: {"model": ErrorResponse, "description": "Extraction id not found."},
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["extraction"],
)
async def get_substances_page(
    extraction_id: int,
    db: DbDep,
    page: int = Query(1, ge=1),
    size: int = Query(12, ge=1, le=48),
    sort: str = Query("extraction_order"),
) -> PagedSubstancesResponse:
    """Paginated substances for one extraction (D-01, DISP-03)."""
    exists = await db.scalar(
        select(func.count())
        .select_from(Extraction)
        .where(Extraction.id == extraction_id)
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Extraction not found")

    total = (
        await db.scalar(
            select(func.count())
            .select_from(Substance)
            .join(ExtractionSubstance, Substance.id == ExtractionSubstance.substance_id)
            .where(ExtractionSubstance.extraction_id == extraction_id)
        )
        or 0
    )

    order_col = (
        Substance.molecular_formula.asc()
        if sort == "formula"
        else ExtractionSubstance.position.asc()
    )

    result = await db.execute(
        select(Substance)
        .join(ExtractionSubstance, Substance.id == ExtractionSubstance.substance_id)
        .where(ExtractionSubstance.extraction_id == extraction_id)
        .order_by(order_col)
        .offset((page - 1) * size)
        .limit(size)
    )
    substances = result.scalars().all()

    items = [
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
        for s in substances
    ]

    return PagedSubstancesResponse(
        items=items,
        total=total,
        page=page,
        size=size,
        pages=math.ceil(total / size) if total > 0 else 0,
    )
