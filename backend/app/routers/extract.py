"""Single-file extraction endpoint for CDX/CDXML uploads.

POST /api/extract accepts a ChemDraw file via multipart/form-data, detects
the format from content, extracts substances with SVG depictions,
and returns ExtractionResponse JSON with metadata and optional warnings.
"""

import asyncio
import base64
import logging
import math
import time
from typing import Annotated

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery_app
from app.config import settings
from app.middleware.rate_limit import limiter
from app.models.chemistry import (
    ErrorResponse,
    ExtractionResponse,
    ExtractJobResponse,
    ExtractJobStatusResponse,
    PagedSubstancesResponse,
    SubstanceResponse,
)
from app.models.orm import Extraction, ExtractionSubstance, Substance
from app.services.db import get_scoped_db
from app.services.extractor import extract_substances_with_svg
from app.services.format_detector import check_extension_mismatch, detect_format

# Async single-file extraction reuses the batch worker task and the same
# job-ownership records (an unguessable task_id bound to the caller's scope) so
# the poll endpoint can't be used to read another session's job state.
from app.services.job_ownership import (
    record_job_owner,
    require_job_owner,
    scope_owner_token,
)
from app.services.persistence import save_extraction
from app.services.upload_guard import read_upload_bounded
from app.tasks.extraction import extract_file_task

logger = logging.getLogger(__name__)

# Cap stored/echoed worker error strings (mirrors batch.py).
_ERROR_DETAIL_MAX_CHARS = 200

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
    content, extracts substances with SVG depictions, and returns
    a structured response with metadata and optional warnings.
    """
    # Bounded streaming read aborts the body scan the moment accumulated
    # bytes exceed ``max_upload_size`` even when the client omits
    # Content-Length or uses chunked transfer encoding.
    file_bytes = await read_upload_bounded(file, settings.max_upload_size)

    start = time.perf_counter()

    # Content-based format detection is authoritative.
    format_type = detect_format(file_bytes)

    # Extension mismatch is a warning, not an error.
    warnings: list[str] = []
    if file.filename:
        warnings.extend(check_extension_mismatch(file.filename, format_type))

    # Substances only (reactions not yet supported); SVGs inline.
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

    # Auto-persist every extraction. Best-effort — DB failures are
    # logged but never break extraction. CancelledError re-raises so
    # graceful shutdown and client-disconnect handling still work.
    # Filename is repr-wrapped + truncated to prevent log-injection via
    # crafted names (e.g. ``"x\n[CRITICAL] fake"``).
    try:
        # Thread the scoped dependency's resolved
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


@router.post(
    "/extract/jobs",
    response_model=ExtractJobResponse,
    status_code=202,
    operation_id="submitExtractJob",
    summary="Submit an async single-file extraction",
    description=(
        "Asynchronous single-file extraction. Validates the upload (format + "
        "size) up front, then hands the work to the background worker and "
        "returns a `task_id` immediately — the HTTP request is never held open "
        "for the extraction itself, so no proxy/gateway can time it out. Poll "
        "`GET /api/extract/jobs/{task_id}` for the result. Use this from "
        "browsers; the synchronous `POST /api/extract` remains for direct API "
        "callers that set their own timeout."
    ),
    responses={
        202: {"description": "Extraction queued; poll the status endpoint."},
        413: {
            "model": ErrorResponse,
            "description": "File exceeds the upload size limit.",
        },
        415: {
            "model": ErrorResponse,
            "description": "Unrecognized file format (not CDX or CDXML).",
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["extraction"],
)
@limiter.limit(settings.rate_limit_upload)
async def submit_extract_job(request: Request, file: UploadFile) -> ExtractJobResponse:
    """Queue a single-file extraction on the worker; return a poll handle.

    Format/size validation happens synchronously so a bad upload fails fast
    (413/415) instead of becoming a queued task that errors seconds later. The
    extraction itself runs in the Celery worker (same task as batch), keyed to
    the caller's scope for the status poll.
    """
    file_bytes = await read_upload_bounded(file, settings.max_upload_size)
    # Content-based format detection is authoritative; an unknown format raises
    # FormatDetectionError -> 415 here, before anything is queued.
    detect_format(file_bytes)

    # Forward the resolved scope to the worker so persisted rows carry the same
    # owner columns RLS reads from (mirrors batch start). The hasattr guard
    # keeps direct unit-test callers that bypass the scoped dependency working.
    if not hasattr(request.state, "scope"):
        request.state.scope = (None, None)
    session_id, api_key_hash = request.state.scope
    api_key_hash_hex = api_key_hash.hex() if api_key_hash else None

    async_result = extract_file_task.apply_async(
        args=[
            base64.b64encode(file_bytes).decode("ascii"),
            file.filename or "unknown",
            None,  # batch_id: standalone extraction, not part of a batch
        ],
        kwargs={"session_id": session_id, "api_key_hash_hex": api_key_hash_hex},
    )
    record_job_owner(async_result.id, scope_owner_token(session_id, api_key_hash))
    return ExtractJobResponse(task_id=async_result.id)


@router.get(
    "/extract/jobs/{task_id}",
    response_model=ExtractJobStatusResponse,
    operation_id="getExtractJobStatus",
    summary="Poll an async extraction job",
    description=(
        "Return the status of an extraction submitted via "
        "`POST /api/extract/jobs`. `state` is `processing` until the worker "
        "finishes, then `done` (with `extraction_id` — fetch the full result "
        "from `GET /api/history/{id}`) or `failed` (with an `error` message). "
        "Scoped to the caller that submitted the job."
    ),
    responses={
        200: {"description": "Job status."},
        404: {
            "model": ErrorResponse,
            "description": "Unknown task_id, or owned by another session.",
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["extraction"],
)
# Own generous bucket (override_defaults) — the client polls ~1/s for minutes,
# so the 120/min default would 429 a long/concurrent extraction into a failure.
@limiter.limit(settings.rate_limit_poll, override_defaults=True)
async def get_extract_job(request: Request, task_id: str) -> ExtractJobStatusResponse:
    """Poll a single-file extraction job by task_id.

    Raises:
        HTTPException 404: task_id is unknown or owned by another session.
    """
    require_job_owner(task_id, request)

    result = AsyncResult(task_id, app=celery_app)
    if not result.ready():
        return ExtractJobStatusResponse(state="processing")

    # Three failure sources collapse to one "failed": the task returned an error
    # dict, the task crashed at the broker/worker level (result.failed()), or it
    # ended with no persisted row (e.g. revoked — terminal but extraction_id is
    # None). Anything else is a real success carrying an extraction_id.
    payload = result.result if isinstance(result.result, dict) else {}
    error = payload.get("error") or (str(result.result) if result.failed() else None)
    extraction_id = payload.get("extraction_id")
    if error or extraction_id is None:
        return ExtractJobStatusResponse(
            state="failed",
            error=str(error or "Extraction did not complete.")[
                :_ERROR_DETAIL_MAX_CHARS
            ],
        )
    return ExtractJobStatusResponse(state="done", extraction_id=extraction_id)


@router.get(
    "/extractions/{extraction_id}/substances",
    response_model=PagedSubstancesResponse,
    operation_id="getExtractionSubstances",
    summary="Paginated substances for one extraction",
    description=(
        "Return a paginated slice of substances belonging to a single "
        "extraction. `page` is 1-based; `size` is clamped "
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
    """Paginated substances for one extraction."""
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
