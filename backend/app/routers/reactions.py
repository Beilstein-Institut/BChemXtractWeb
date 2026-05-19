"""Experimental reaction-extraction endpoint (Plan 10).

POST /api/reactions accepts a CDX/CDXML file via multipart/form-data,
extracts reactions + renders SVGs via CDK's DepictionGenerator, and
returns ReactionExtractionResponse JSON.

GET /api/extractions/{extraction_id}/reactions returns cached reactions
for the given extraction (D-23 history-hydration path -- lets the
frontend ReactionsTab pre-populate when loading a history entry with
reaction_count > 0, skipping the re-extract CTA).

Per D-06: timeouts return HTTP 200 with reactions=[] + warning (NOT 408/503).
Per D-07: structural isolation from /api/extract -- no shared try/except.
Per D-19: auto-persist best-effort -- DB failures logged, never re-raised.
Per D-25: ErrorResponse shapes for 413/415/422/500.
"""

import asyncio
import hashlib
import logging
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.middleware.rate_limit import limiter
from app.models.chemistry import ErrorResponse, ReactionExtractionResponse
from app.routers._shared import check_extension_mismatch
from app.services.db import get_scoped_db
from app.services.extractor import extract_reactions_with_svg
from app.services.format_detector import detect_format
from app.services.persistence import (
    get_extraction_reactions,
    get_or_create_extraction_row,
    save_reactions,
)
from app.services.upload_guard import read_upload_bounded

logger = logging.getLogger(__name__)

router = APIRouter()
DbDep = Annotated[AsyncSession, Depends(get_scoped_db)]


@router.post(
    "/reactions",
    response_model=ReactionExtractionResponse,
    operation_id="extractReactions",
    summary="Extract reactions from a CDX/CDXML file (experimental)",
    description=(
        "Opt-in reaction extraction (Plan 10, experimental). Detects the "
        "file format from its content (magic bytes `VjCD` for binary CDX "
        "vs. XML CDXML), routes through BChemXtract's ReactionXtractor, "
        "and renders each reaction as a combined CDK SVG via "
        "DepictionGenerator.\n\n"
        "**Experimental.** Accuracy varies with ChemDraw file quality.\n\n"
        "**Timeout:** hard-capped at `REACTION_TIMEOUT_SECS` (default 30s). "
        "On timeout, returns HTTP 200 with empty `reactions` and a warning "
        "message -- NOT HTTP 408 or 503. Clients should handle both the "
        "success-with-reactions and success-with-warning paths."
    ),
    responses={
        200: {
            "description": "Reaction extraction complete (may contain warnings).",
            "content": {
                "application/json": {
                    "example": {
                        "reactions": [],
                        "format": "cdx",
                        "filename": "example.cdx",
                        "file_size": 1024,
                        "reaction_count": 0,
                        "extraction_time_ms": 42.0,
                        "warnings": [],
                        "extraction_id": 1,
                    }
                }
            },
        },
        413: {
            "model": ErrorResponse,
            "description": "File exceeds upload size limit.",
        },
        415: {
            "model": ErrorResponse,
            "description": "Unrecognized file format.",
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
async def extract_reactions_endpoint(
    request: Request, file: UploadFile, db: DbDep
) -> ReactionExtractionResponse:
    """Extract reactions from a CDX/CDXML file upload (experimental, Plan 10).

    Per D-06: timeouts return HTTP 200 + warning (not 408/503).
    Per D-19: auto-persists; DB failures logged but never raised.
    Per Pitfall 9: creates a minimal Extraction row when /api/extract never ran.
    """
    # SEC M-02: bounded streaming read — mirrors extract.py.
    file_bytes = await read_upload_bounded(file, settings.max_upload_size)

    start = time.perf_counter()
    # raises FormatDetectionError -> 415
    format_type = detect_format(file_bytes)

    warnings: list[str] = []
    if file.filename:
        warnings.extend(check_extension_mismatch(file.filename, format_type))

    # D-06: timeout becomes warning, NOT 503.
    try:
        reactions, extractor_warnings = await extract_reactions_with_svg(
            file_bytes,
            format_type,
            timeout=settings.reaction_timeout_secs,
        )
        warnings.extend(extractor_warnings)
    except TimeoutError:
        logger.warning(
            "Reaction extraction timed out after %.1fs on filename=%r",
            settings.reaction_timeout_secs,
            (file.filename or "")[:100],
        )
        reactions = []
        warnings.append(
            f"Reaction extraction exceeded "
            f"{settings.reaction_timeout_secs:.1f}s timeout and was aborted."
        )

    elapsed_ms = (time.perf_counter() - start) * 1000

    response = ReactionExtractionResponse(
        reactions=reactions,
        format=format_type,
        filename=file.filename or "",
        file_size=len(file_bytes),
        reaction_count=len(reactions),
        extraction_time_ms=round(elapsed_ms, 1),
        warnings=warnings,
    )

    # D-19: auto-persist best-effort. Pitfall 9: create a minimal
    # Extraction row when the file has never been substance-extracted
    # first. Re-raise CancelledError so graceful shutdown / client
    # disconnects still abort the coroutine cleanly (SEC M-05).
    # Filename truncated + repr-quoted in the log message to prevent
    # log-injection via crafted filenames.
    try:
        # Phase 11 D-01: same scope-threading discipline as
        # routers/extract.py — both the get-or-create and save-reactions
        # calls receive the request's (session_id, api_key_hash) tuple so
        # parent + join rows carry matching owner columns for RLS.
        scope = request.state.scope if hasattr(request.state, "scope") else (None, None)
        file_hash = hashlib.sha256(file_bytes).hexdigest()
        extraction_id = await get_or_create_extraction_row(
            db,
            filename=response.filename,
            file_size=response.file_size,
            format=response.format,
            file_hash=file_hash,
            scope=scope,
        )
        await save_reactions(db, extraction_id, reactions, scope=scope)
        response = response.model_copy(update={"extraction_id": extraction_id})
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception(
            "Reaction auto-persist failed for filename=%r -- result still returned",
            (file.filename or "")[:100],
        )

    return response


# D-23: history-hydration endpoint -- frontend ReactionsTab reads cached
# reactions when a user loads an extraction from History and reaction_count > 0.
@router.get(
    "/extractions/{extraction_id}/reactions",
    response_model=ReactionExtractionResponse,
    operation_id="getExtractionReactions",
    summary="Fetch cached reactions for a prior extraction",
    description=(
        "Returns the reactions stored for a given extraction_id. Used by "
        "the frontend Reactions tab to pre-hydrate the list when loading "
        "an extraction from History (D-23). Returns an empty reactions list "
        "with 200 status when the extraction exists but has never had "
        "reaction extraction run (`reaction_count == 0`)."
    ),
    responses={
        200: {
            "description": "Reactions found (may be empty list if reaction_count=0).",
        },
        404: {"model": ErrorResponse, "description": "Extraction not found."},
    },
    tags=["extraction"],
)
async def get_extraction_reactions_endpoint(
    extraction_id: int, db: DbDep
) -> ReactionExtractionResponse:
    """Return cached reactions for an extraction (D-23 history hydration).

    Returns 404 when the extraction_id doesn't exist. Returns 200 + empty
    reactions list when the extraction exists but reaction_count == 0.
    """
    result = await get_extraction_reactions(db, extraction_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Extraction not found")
    extraction, reactions = result
    return ReactionExtractionResponse(
        reactions=reactions,
        format=extraction.format,
        filename=extraction.filename,
        file_size=extraction.file_size,
        reaction_count=extraction.reaction_count,
        extraction_time_ms=0.0,  # DB read -- not a fresh extraction
        warnings=[],
        extraction_id=extraction.id,
    )
