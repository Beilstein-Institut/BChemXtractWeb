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
from typing import Annotated

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
from app.models.chemistry import BatchStartResponse, ErrorResponse
from app.models.orm import Extraction, ExtractionSubstance, Substance
from app.services.db import get_db
from app.services.upload_guard import read_upload_bounded
from app.tasks.extraction import extract_file_task

# Hard cap on concurrent files accepted per batch request. A malicious
# client can still submit many separate batches; rate limiting (SEC C-02)
# bounds the per-IP per-minute ceiling.
_BATCH_FILE_LIMIT = 20

router = APIRouter()

DbDep = Annotated[AsyncSession, Depends(get_db)]


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
        400: {"model": ErrorResponse, "description": "Batch exceeds the 20-file limit."},
        422: {"model": ErrorResponse, "description": "One or more files exceed the upload size limit."},
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["batch"],
)
@limiter.limit(settings.rate_limit_batch)
async def start_batch(
    request: Request, files: list[UploadFile] = File(...)
) -> BatchStartResponse:
    """Start a batch extraction. Returns batch_id for progress tracking.

    Validates file count (<= 20) and file size (<= 50 MB) before enqueueing.
    Each file becomes one independent Celery task. The GroupResult.id IS the batch_id.

    Raises:
        HTTPException 400: Batch exceeds 20-file limit.
        HTTPException 422: Individual file exceeds max_upload_size.
    """
    if len(files) > _BATCH_FILE_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"Batch exceeds the {_BATCH_FILE_LIMIT}-file limit",
        )

    # SEC H-02 preflight: fail fast using the Content-Length-derived
    # ``UploadFile.size`` BEFORE reading any bytes, so oversize submissions
    # don't drain RAM. The bounded streaming read below is still the
    # authoritative gate for clients that omit Content-Length.
    for f in files:
        if f.size is not None and f.size > settings.max_upload_size:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"{f.filename or 'unnamed'} exceeds the "
                    f"{settings.max_upload_size // (1024 * 1024)} MB limit"
                ),
            )

    task_signatures = []
    batch_id = str(uuid.uuid4())

    for f in files:
        try:
            file_bytes = await read_upload_bounded(f, settings.max_upload_size)
        except Exception as exc:  # FileSizeError → 413 via BridgeError handler
            # Preserve the unified error shape by re-raising; 413/FILE_TOO_LARGE
            # is the correct semantic here because the client attempted to
            # upload a payload larger than the documented limit.
            raise exc
        task_signatures.append(
            extract_file_task.s(
                base64.b64encode(file_bytes).decode("ascii"),
                f.filename or "unknown",
                batch_id,
            )
        )

    task_group = group(task_signatures)
    group_result = task_group.apply_async()
    group_result.save()  # persist GroupResult to Redis so SSE endpoint can restore it

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
            "description": "Progress stream opened. Media type is text/event-stream.",
        },
        404: {"model": ErrorResponse, "description": "Batch group_id not found."},
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["batch"],
)
async def batch_progress(group_id: str, request: Request) -> EventSourceResponse:
    """Stream SSE events for batch progress.

    group_id is the Celery GroupResult.id (NOT the custom batch_id used for DB/ZIP lookups).
    The frontend sends group_id from BatchStartResponse to this endpoint.

    Sends one file_complete event per completed task, then batch_complete when all done.
    Disconnects cleanly when client closes the connection.
    Polls every 0.5 seconds (D-14: non-blocking SSE polling pattern).
    """

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

                if task_id not in reported and result.ready():
                    reported.add(task_id)
                    raw_result = result.result
                    if isinstance(raw_result, BaseException):
                        # Task entered FAILURE state via broker/worker error — result is an
                        # Exception object, not a dict. Serialize to a safe string form.
                        serializable_result = {"error": str(raw_result)[:200]}
                    else:
                        serializable_result = raw_result
                    try:
                        event_data = json.dumps({
                            "task_id": task_id,
                            "state": result.state,
                            "result": serializable_result,
                        })
                    except (TypeError, ValueError) as exc:
                        event_data = json.dumps({
                            "task_id": task_id,
                            "state": "FAILURE",
                            "result": {"error": f"Result not serializable: {exc!s}"[:200]},
                        })
                    yield ServerSentEvent(data=event_data, event="file_complete")

                if not result.ready():
                    all_done = False

            if all_done:
                yield ServerSentEvent(
                    data=json.dumps({"group_id": group_id}), event="batch_complete"
                )
                break

            await asyncio.sleep(0.5)

    return EventSourceResponse(event_generator())


@router.delete(
    "/batch/{group_id}",
    status_code=204,
    operation_id="cancelBatch",
    summary="Cancel pending batch tasks",
    description=(
        "Revoke all pending tasks in the batch. The currently running "
        "task (if any) finishes normally per D-10 — `terminate=False` "
        "so no in-flight file is interrupted. `group_id` is the Celery "
        "GroupResult.id returned by `POST /api/batch`."
    ),
    responses={
        204: {"description": "Pending tasks cancelled."},
        404: {"model": ErrorResponse, "description": "Batch group_id not found."},
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["batch"],
)
async def cancel_batch(group_id: str) -> None:
    """Cancel pending tasks in a batch.

    group_id is the Celery GroupResult.id (NOT the custom batch_id used for DB/ZIP lookups).
    Running task completes (D-10: cancel after current).
    terminate=False means the currently executing task finishes normally.

    Raises:
        HTTPException 404: Batch not found.
    """
    group_result = GroupResult.restore(group_id, app=celery_app)
    if group_result is None:
        raise HTTPException(status_code=404, detail="Batch not found")

    for async_result in group_result.results:
        result = AsyncResult(async_result.id, app=celery_app)
        if result.state in ("PENDING", "RECEIVED"):
            celery_app.control.revoke(async_result.id, terminate=False)


@router.get(
    "/batch/{batch_id}/zip",
    operation_id="downloadBatchZip",
    summary="Download combined batch results as a ZIP",
    description=(
        "Build and stream a ZIP containing one JSON export per completed "
        "extraction in the batch. Each entry is named "
        "`{extraction.filename}.json`. Entry filenames are sanitized to "
        "prevent zip-slip (T-07-07). `batch_id` is the UUID assigned at "
        "batch start (NOT the Celery group_id)."
    ),
    responses={
        200: {"description": "ZIP streamed back as `application/zip`."},
        404: {"model": ErrorResponse, "description": "No extractions found for this batch."},
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["batch"],
)
async def download_batch_zip(batch_id: str, db: DbDep) -> StreamingResponse:
    """Build and stream a ZIP of per-file JSON exports for all completed files in the batch.

    Each ZIP entry is named "{extraction.filename}.json".
    ZIP filename is "batch_{batch_id[:8]}.zip" (short UUID prefix for readability).
    Filename sanitized to prevent zip-slip (T-07-07).

    Raises:
        HTTPException 404: No extractions found for this batch_id.
    """
    result = await db.execute(
        select(Extraction).where(Extraction.batch_id == batch_id)
    )
    extractions = result.scalars().all()

    if not extractions:
        raise HTTPException(status_code=404, detail="No extractions found for this batch")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for extraction in extractions:
            substance_result = await db.execute(
                select(Substance)
                .join(ExtractionSubstance, Substance.id == ExtractionSubstance.substance_id)
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
                "substances": [
                    {
                        "inchi_key": s.inchi_key,
                        "inchi": s.inchi,
                        "smiles": s.smiles,
                        "extended_smiles": s.extended_smiles,
                        "molecular_formula": s.molecular_formula,
                        "svg": s.svg,
                        "mdlv3000": s.mdlv3000,
                    }
                    for s in substances
                ],
            }
            # Sanitize filename to prevent zip-slip (T-07-07)
            safe_name = extraction.filename.replace("/", "_").replace("\\", "_")
            zf.writestr(f"{safe_name}.json", json.dumps(response_dict, indent=2))

    buf.seek(0)
    zip_filename = f"batch_{batch_id[:8]}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'},
    )
