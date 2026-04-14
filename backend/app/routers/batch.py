"""Batch processing endpoints for multi-file CDX/CDXML extraction.

POST /api/batch          — start a batch, returns batch_id
GET  /api/batch/{id}/progress — SSE stream of per-file completion events
DELETE /api/batch/{id}   — cancel pending tasks (after current file)
GET  /api/batch/{id}/zip — on-demand ZIP of per-file JSON exports
"""
import asyncio
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
from app.models.chemistry import BatchStartResponse
from app.models.orm import Extraction, ExtractionSubstance, Substance
from app.services.db import get_db
from app.tasks.extraction import extract_file_task

router = APIRouter(tags=["batch"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("/batch", response_model=BatchStartResponse, status_code=202)
async def start_batch(files: list[UploadFile] = File(...)) -> BatchStartResponse:
    """Start a batch extraction. Returns batch_id for progress tracking.

    Validates file count (<= 20) and file size (<= 50 MB) before enqueueing.
    Each file becomes one independent Celery task. The GroupResult.id IS the batch_id.

    Raises:
        HTTPException 400: Batch exceeds 20-file limit.
        HTTPException 422: Individual file exceeds max_upload_size.
    """
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Batch exceeds 20-file limit")

    task_signatures = []
    batch_id = str(uuid.uuid4())

    for f in files:
        file_bytes = await f.read()
        if len(file_bytes) > settings.max_upload_size:
            raise HTTPException(
                status_code=422,
                detail=f"{f.filename} exceeds the {settings.max_upload_size // (1024 * 1024)} MB limit",
            )
        task_signatures.append(
            extract_file_task.s(file_bytes, f.filename or "unknown", batch_id)
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


@router.get("/batch/{batch_id}/progress")
async def batch_progress(batch_id: str, request: Request) -> EventSourceResponse:
    """Stream SSE events for batch progress.

    Sends one file_complete event per completed task, then batch_complete when all done.
    Disconnects cleanly when client closes the connection.
    Polls every 0.5 seconds (D-14: non-blocking SSE polling pattern).
    """

    async def event_generator():
        group_result = GroupResult.restore(batch_id, app=celery_app)
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
                    payload = {
                        "task_id": task_id,
                        "state": result.state,
                        "result": result.result,
                    }
                    yield ServerSentEvent(data=json.dumps(payload), event="file_complete")

                if not result.ready():
                    all_done = False

            if all_done:
                yield ServerSentEvent(
                    data=json.dumps({"batch_id": batch_id}), event="batch_complete"
                )
                break

            await asyncio.sleep(0.5)

    return EventSourceResponse(event_generator())


@router.delete("/batch/{batch_id}", status_code=204)
async def cancel_batch(batch_id: str) -> None:
    """Cancel pending tasks in a batch.

    Running task completes (D-10: cancel after current).
    terminate=False means the currently executing task finishes normally.

    Raises:
        HTTPException 404: Batch not found.
    """
    group_result = GroupResult.restore(batch_id, app=celery_app)
    if group_result is None:
        raise HTTPException(status_code=404, detail="Batch not found")

    for async_result in group_result.results:
        result = AsyncResult(async_result.id, app=celery_app)
        if result.state in ("PENDING", "RECEIVED"):
            celery_app.control.revoke(async_result.id, terminate=False)


@router.get("/batch/{batch_id}/zip")
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
