"""Batch processing endpoints for multi-file CDX/CDXML extraction.

POST /api/batch          — start a batch, returns batch_id
GET  /api/batch/{id}/progress — SSE stream of per-file completion events
DELETE /api/batch/{id}   — cancel pending tasks (after current file)
GET  /api/batch/{id}/zip — on-demand ZIP of per-file JSON exports
"""

import asyncio
import base64
import io
import json
import uuid
import zipfile
from typing import Annotated, Any

from celery import group
from celery.result import AsyncResult, GroupResult
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse, ServerSentEvent

from app.celery_app import celery_app
from app.config import settings
from app.middleware.rate_limit import limiter
from app.models.chemistry import (
    BatchExtractionItem,
    BatchExtractionsResponse,
    BatchStartResponse,
    ErrorResponse,
)
from app.models.orm import Extraction, ExtractionSubstance, Substance
from app.services.db import get_scoped_db
from app.services.filenames import build_content_disposition, safe_filename
from app.services.upload_guard import read_upload_bounded
from app.tasks.extraction import extract_file_task

# Hard cap on concurrent files accepted per batch request. A malicious
# client can still submit many separate batches; rate limiting
# bounds the per-IP per-minute ceiling.
_BATCH_FILE_LIMIT = 20
_SSE_POLL_SECONDS = 0.5
_ERROR_DETAIL_MAX_CHARS = 200

# Redis key prefix binding a Celery group_id to the scope that started the
# batch. The SSE-progress and cancel endpoints address a batch purely by its
# Celery group_id and touch only Celery/Redis (which carry no Postgres RLS),
# so without this binding any party holding a group_id could stream another
# session's per-file results or cancel its pending tasks (IDOR, CWE-639).
_BATCH_OWNER_KEY_PREFIX = "bcx:batch-owner:"


router = APIRouter()

DbDep = Annotated[AsyncSession, Depends(get_scoped_db)]
UploadFiles = Annotated[list[UploadFile], File(...)]


def _owner_store():
    """Return the Redis client backing batch-ownership records.

    Indirection point so tests can substitute an in-memory fake without a
    live Redis. Uses the Celery result backend's client — the same store the
    GroupResult is saved to — so ownership records share its lifetime.
    """
    return celery_app.backend.client


def _scope_owner_token(session_id: str | None, api_key_hash: bytes | None) -> str:
    """Stable string identity for a request scope.

    Binds a batch to the session cookie or API key that created it. API-key
    scope takes precedence over a session id, mirroring ``get_scoped_db``.
    """
    if api_key_hash is not None:
        return f"akh:{api_key_hash.hex()}"
    if session_id is not None:
        return f"sid:{session_id}"
    return "anon:"


def _batch_owner_key(group_id: str) -> str:
    return f"{_BATCH_OWNER_KEY_PREFIX}{group_id}"


def _record_batch_owner(group_id: str, token: str) -> None:
    """Persist the batch owner token with the same TTL as the group result."""
    ttl = int(celery_app.conf.result_expires or 3600)
    _owner_store().set(_batch_owner_key(group_id), token, ex=ttl)


def _require_batch_owner(group_id: str, request: Request) -> None:
    """Raise 404 unless the caller's scope matches the recorded batch owner.

    A missing or foreign owner record is reported identically to a genuinely
    absent batch so the endpoint cannot be used to probe which group_ids
    exist.
    """
    scope = getattr(request.state, "scope", (None, None))
    expected = _scope_owner_token(*scope)
    stored = _owner_store().get(_batch_owner_key(group_id))
    if stored is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    stored_token = stored.decode() if isinstance(stored, bytes) else str(stored)
    if stored_token != expected:
        raise HTTPException(status_code=404, detail="Batch not found")


def _substance_to_dict(s: Substance) -> dict[str, Any]:
    """Serialise a Substance ORM row for inclusion in the ZIP JSON export."""
    return {
        "inchi_key": s.inchi_key,
        "inchi": s.inchi,
        "smiles": s.smiles,
        "extended_smiles": s.extended_smiles,
        "molecular_formula": s.molecular_formula,
        "svg": s.svg,
        "mdlv3000": s.mdlv3000,
    }


def _task_completion_event(async_result: AsyncResult) -> ServerSentEvent:
    """Build the SSE payload for one completed Celery task.

    Falls back to a serialisable error dict when the task result is
    either an Exception (FAILURE state with broker/worker error) or not
    JSON-encodable (shape drift from future task changes).
    """
    raw_result = async_result.result
    if isinstance(raw_result, BaseException):
        # Task entered FAILURE state via broker/worker error.
        serializable = {"error": str(raw_result)[:_ERROR_DETAIL_MAX_CHARS]}
    else:
        serializable = raw_result
    try:
        data = json.dumps(
            {
                "task_id": async_result.id,
                "state": async_result.state,
                "result": serializable,
            }
        )
    except (TypeError, ValueError) as exc:
        data = json.dumps(
            {
                "task_id": async_result.id,
                "state": "FAILURE",
                "result": {
                    "error": (f"Result not serializable: {exc!s}")[
                        :_ERROR_DETAIL_MAX_CHARS
                    ]
                },
            }
        )
    return ServerSentEvent(data=data, event="file_complete")


@router.post(
    "/batch",
    response_model=BatchStartResponse,
    status_code=202,
    operation_id="startBatch",
    summary="Start a multi-file batch extraction",
    description=(
        "Queue up to 20 CDX/CDXML files for background extraction. Each "
        "file becomes one independent Celery task; the Celery "
        "GroupResult.id is returned as `group_id` and is the handle for "
        "SSE progress, cancellation, and ZIP download. Per-file size cap "
        "is `max_upload_size` (default 20 MB). Returns 202 Accepted with "
        "ids for progress tracking."
    ),
    responses={
        202: {"description": "Batch accepted; tasks enqueued."},
        400: {
            "model": ErrorResponse,
            "description": "Batch exceeds the 20-file limit.",
        },
        422: {
            "model": ErrorResponse,
            "description": "One or more files exceed the upload size limit.",
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["batch"],
)
@limiter.limit(settings.rate_limit_batch)
async def start_batch(request: Request, files: UploadFiles) -> BatchStartResponse:
    """Start a batch extraction. Returns batch_id for progress tracking.

    Validates file count (<= 20) and file size (<= 50 MB) before enqueueing.
    Each file becomes one independent Celery task. The GroupResult.id IS
    the batch_id.

    Raises:
        HTTPException 400: Batch exceeds 20-file limit.
        HTTPException 422: Individual file exceeds max_upload_size.
    """
    if len(files) > _BATCH_FILE_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"Batch exceeds the {_BATCH_FILE_LIMIT}-file limit",
        )

    # Preflight: fail fast using the Content-Length-derived
    # ``UploadFile.size`` BEFORE reading any bytes, so oversize
    # submissions don't drain RAM. The bounded streaming read below is
    # still the authoritative gate for clients that omit Content-Length.
    max_mb = settings.max_upload_size // (1024 * 1024)
    for f in files:
        if f.size is not None and f.size > settings.max_upload_size:
            raise HTTPException(
                status_code=422,
                detail=f"{f.filename or 'unnamed'} exceeds the {max_mb} MB limit",
            )

    # Forward the request's resolved scope to the Celery
    # worker through task kwargs. session_id is the UUID4 string;
    # api_key_hash is serialised as hex so it round-trips through Redis
    # JSON. The worker re-decodes to bytes before persistence. The
    # hasattr guard preserves direct unit-test callers that bypass the
    # scoped dependency.
    if not hasattr(request.state, "scope"):
        request.state.scope = (None, None)
    session_id, api_key_hash = request.state.scope
    api_key_hash_hex = api_key_hash.hex() if api_key_hash else None

    batch_id = str(uuid.uuid4())
    task_signatures = []
    for f in files:
        # FileSizeError -> 413 via BridgeError handler; any other error
        # propagates unchanged (bounded streaming read is the sole source
        # of enforcement for clients that omit Content-Length).
        file_bytes = await read_upload_bounded(f, settings.max_upload_size)
        task_signatures.append(
            extract_file_task.s(
                base64.b64encode(file_bytes).decode("ascii"),
                f.filename or "unknown",
                batch_id,
                session_id=session_id,
                api_key_hash_hex=api_key_hash_hex,
            )
        )

    group_result = group(task_signatures).apply_async()
    # Persist GroupResult to Redis so SSE endpoint can restore it.
    group_result.save()
    # Bind the group_id to this caller so the SSE/cancel endpoints (which key
    # on group_id and bypass RLS) can reject other sessions.
    _record_batch_owner(group_result.id, _scope_owner_token(session_id, api_key_hash))

    return BatchStartResponse(
        batch_id=batch_id,
        group_id=group_result.id,
        task_ids=[r.id for r in group_result.results],
        file_count=len(files),
    )


@router.get(
    "/batch/{group_id}/progress",
    operation_id="streamBatchProgress",
    summary="Server-Sent Event stream of per-file batch progress",
    description=(
        "Returns a `text/event-stream` that emits one SSE message per "
        "state change (queued -> running -> completed/failed). Clients "
        "should consume via `EventSource('/api/batch/{group_id}/progress')`. "
        "The stream closes when all tasks are in a terminal state. "
        "`group_id` is the Celery GroupResult.id returned by "
        "`POST /api/batch` (NOT the custom `batch_id` used for DB/ZIP "
        "lookups)."
    ),
    responses={
        200: {
            "description": ("Progress stream opened. Media type is text/event-stream."),
        },
        404: {
            "model": ErrorResponse,
            "description": "Batch group_id not found.",
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["batch"],
)
async def batch_progress(group_id: str, request: Request) -> EventSourceResponse:
    """Stream SSE events for batch progress.

    group_id is the Celery GroupResult.id returned by POST /api/batch —
    NOT the custom batch_id used for DB/ZIP lookups.

    Emits one ``file_complete`` event per completed task, then
    ``batch_complete`` when all are terminal. Disconnects cleanly when
    the client closes the connection. Polls every 0.5 s
    (non-blocking SSE polling pattern).

    Raises:
        HTTPException 404: group_id is unknown or owned by another session.
    """
    # Ownership gate runs before the stream opens so a foreign/missing batch
    # gets a plain 404, not an SSE error event.
    _require_batch_owner(group_id, request)

    async def event_generator():
        group_result = GroupResult.restore(group_id, app=celery_app)
        if group_result is None:
            yield ServerSentEvent(
                data=json.dumps({"error": "Batch not found"}), event="error"
            )
            return

        reported: set[str] = set()

        while True:
            if await request.is_disconnected():
                break

            all_done = True
            for async_result in group_result.results:
                task_id = async_result.id
                result = AsyncResult(task_id, app=celery_app)
                if not result.ready():
                    all_done = False
                    continue
                if task_id in reported:
                    continue
                reported.add(task_id)
                yield _task_completion_event(result)

            if all_done:
                yield ServerSentEvent(
                    data=json.dumps({"group_id": group_id}),
                    event="batch_complete",
                )
                break

            await asyncio.sleep(_SSE_POLL_SECONDS)

    return EventSourceResponse(event_generator())


@router.delete(
    "/batch/{group_id}",
    status_code=204,
    operation_id="cancelBatch",
    summary="Cancel pending batch tasks",
    description=(
        "Revoke all pending tasks in the batch. The currently running "
        "task (if any) finishes normally — `terminate=False` "
        "so no in-flight file is interrupted. `group_id` is the Celery "
        "GroupResult.id returned by `POST /api/batch`."
    ),
    responses={
        204: {"description": "Pending tasks cancelled."},
        404: {
            "model": ErrorResponse,
            "description": "Batch group_id not found.",
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["batch"],
)
async def cancel_batch(group_id: str, request: Request) -> None:
    """Cancel pending tasks in a batch.

    group_id is the Celery GroupResult.id (NOT the custom batch_id used
    for DB/ZIP lookups). The currently-executing task finishes normally
    because ``terminate=False`` (cancel after the current file).

    Raises:
        HTTPException 404: group_id is unknown or owned by another session.
    """
    _require_batch_owner(group_id, request)

    group_result = GroupResult.restore(group_id, app=celery_app)
    if group_result is None:
        raise HTTPException(status_code=404, detail="Batch not found")

    for async_result in group_result.results:
        result = AsyncResult(async_result.id, app=celery_app)
        if result.state in ("PENDING", "RECEIVED"):
            celery_app.control.revoke(async_result.id, terminate=False)


@router.get(
    "/batch/{batch_id}",
    response_model=BatchExtractionsResponse,
    operation_id="getBatchExtractions",
    summary="List a batch's extractions",
    description=(
        "Return the extractions belonging to a batch (summary fields only), "
        "in upload order, for the combined batch view. `batch_id` is the UUID "
        "assigned at batch start (NOT the Celery group_id). RLS scopes the "
        "result to the caller's session."
    ),
    responses={
        200: {"description": "Batch extraction summaries."},
        404: {
            "model": ErrorResponse,
            "description": "No extractions found for this batch.",
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["batch"],
)
async def get_batch_extractions(batch_id: str, db: DbDep) -> BatchExtractionsResponse:
    """List a batch's extractions (summaries) in upload order.

    RLS (via get_scoped_db) restricts rows to the caller's session — the same
    implicit scoping the ZIP endpoint relies on.

    Raises:
        HTTPException 404: No extractions found for this batch_id.
    """
    result = await db.execute(
        select(Extraction)
        .where(Extraction.batch_id == batch_id)
        .order_by(Extraction.id)
    )
    extractions = result.scalars().all()
    if not extractions:
        raise HTTPException(
            status_code=404, detail="No extractions found for this batch"
        )
    return BatchExtractionsResponse(
        batch_id=batch_id,
        files=[
            BatchExtractionItem(
                extraction_id=e.id,
                filename=e.filename,
                structure_count=e.structure_count,
            )
            for e in extractions
        ],
    )


@router.get(
    "/batch/{batch_id}/zip",
    operation_id="downloadBatchZip",
    summary="Download combined batch results as a ZIP",
    description=(
        "Build and stream a ZIP containing one JSON export per completed "
        "extraction in the batch. Each entry is named "
        "`{extraction.filename}.json`. Entry filenames are sanitized to "
        "prevent zip-slip. `batch_id` is the UUID assigned at "
        "batch start (NOT the Celery group_id)."
    ),
    responses={
        200: {"description": "ZIP streamed back as `application/zip`."},
        404: {
            "model": ErrorResponse,
            "description": "No extractions found for this batch.",
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["batch"],
)
async def download_batch_zip(batch_id: str, db: DbDep) -> StreamingResponse:
    """Stream a ZIP of per-file JSON exports for all completed batch files.

    Each ZIP entry is named ``{extraction.filename}.json`` (sanitised to
    prevent zip-slip). The archive filename is
    ``batch_{batch_id[:8]}.zip`` (short UUID prefix for readability).

    Raises:
        HTTPException 404: No extractions found for this batch_id.
    """
    result = await db.execute(select(Extraction).where(Extraction.batch_id == batch_id))
    extractions = result.scalars().all()

    if not extractions:
        raise HTTPException(
            status_code=404,
            detail="No extractions found for this batch",
        )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for extraction in extractions:
            substance_result = await db.execute(
                select(Substance)
                .join(
                    ExtractionSubstance,
                    Substance.id == ExtractionSubstance.substance_id,
                )
                .where(ExtractionSubstance.extraction_id == extraction.id)
                .order_by(ExtractionSubstance.position)
            )
            substances = substance_result.scalars().all()

            response_dict = {
                "filename": extraction.filename,
                "file_size": extraction.file_size,
                "format": extraction.format,
                "structure_count": extraction.structure_count,
                "extraction_time_ms": extraction.extraction_time_ms,
                "warnings": extraction.warnings,
                "extraction_id": extraction.id,
                "substances": [_substance_to_dict(s) for s in substances],
            }
            # Centralised allowlist-based sanitisation covers
            # path traversal, control chars, null bytes, and unprintables.
            safe_name = safe_filename(extraction.filename)
            zf.writestr(f"{safe_name}.json", json.dumps(response_dict, indent=2))

    buf.seek(0)
    zip_filename = f"batch_{safe_filename(batch_id)[:8]}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": build_content_disposition(zip_filename),
        },
    )
