"""Celery task for per-file substance extraction in batch processing.

Each task calls _extract_substances_with_svg_sync directly (synchronous,
no asyncio) since Celery's solo pool executes tasks synchronously.
Results are persisted via asyncio.run(save_extraction()) using a fresh
DB session — Celery tasks have no FastAPI request context.

Exceptions are caught and returned as error metadata so the
batch continues processing remaining files.

Import note: service imports are at module level (not deferred) so tests
can patch them at the correct namespace (app.tasks.extraction.*).
"""

import asyncio
import base64
import logging
import time

from celery.exceptions import SoftTimeLimitExceeded

from app.celery_app import celery_app
from app.models.chemistry import (
    ExtractionResponse,
    SubstanceInfoResponse,
    SubstanceResponse,
)
from app.services.db import AsyncSessionLocal
from app.services.extractor import _extract_with_fallback_sync
from app.services.format_detector import detect_format
from app.services.persistence import save_extraction

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="extraction.extract_file")
def extract_file_task(
    self,
    file_b64: str,
    filename: str,
    batch_id: str,
    session_id: str | None = None,
    api_key_hash_hex: str | None = None,
) -> dict:
    """Extract substances from one file and persist the result.

    The request-time scope is serialised through the
    Celery kwargs so the worker — which has no FastAPI request context
    — can stamp the same ``(session_id, api_key_hash)`` onto every row
    it inserts. ``api_key_hash`` is round-tripped as hex because asyncpg
    accepts BYTEA via hex in ``set_config`` and Celery's Redis broker
    serialises kwargs as JSON (bytes are not JSON-safe). The worker
    decodes back to ``bytes`` once per task before calling
    ``save_extraction``.

    Args:
        file_b64: Base64-encoded CDX/CDXML file content (JSON-safe).
        filename: Original filename for metadata and ZIP provenance.
        batch_id: UUID string tagging this extraction to its batch.
        session_id: Caller's bcx_sid UUID4, or None when
            the caller authenticated via X-API-Key.
        api_key_hash_hex: Hex-encoded PBKDF2 lookup hash,
            or None when the caller authenticated via cookie.

    Returns:
        dict with keys: filename, structure_count, extraction_id, error.
        error is None on success, a string on failure (skip-and-continue).
    """
    self.update_state(
        state="STARTED",
        meta={"filename": filename, "status": "processing"},
    )
    start = time.perf_counter()

    try:
        file_bytes = base64.b64decode(file_b64)
        format_type = detect_format(file_bytes)
        warnings: list[str] = []

        raw_substances, raw_info, used_fallback = _extract_with_fallback_sync(
            file_bytes, format_type
        )
        if used_fallback:
            warnings.append(
                "Extracted via fragment fallback — InChI/InChIKey not "
                "available for this file."
            )

        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)

        substances = [SubstanceResponse(**d) for d in raw_substances]

        response = ExtractionResponse(
            filename=filename,
            file_size=len(file_bytes),
            format=format_type,
            structure_count=len(substances),
            extraction_time_ms=elapsed_ms,
            warnings=warnings,
            substances=substances,
            info=SubstanceInfoResponse(**raw_info),
            extraction_id=None,
        )

        # Decode api_key_hash hex transport → bytes for the owner
        # column. The worker has no FastAPI request, so it stashes the
        # scope on db.info so the after_begin listener (services/db.py)
        # applies the RLS GUCs on every BEGIN — required because the
        # extractions policy uses USING for INSERTs too, so missing GUCs
        # raise InsufficientPrivilege under the prod role.
        akh = bytes.fromhex(api_key_hash_hex) if api_key_hash_hex else None

        async def _persist() -> int:
            async with AsyncSessionLocal() as db:
                db.info["rls_scope"] = (session_id, akh)
                extraction = await save_extraction(
                    db, response, scope=(session_id, akh)
                )
                extraction.batch_id = batch_id
                await db.commit()
                return extraction.id

        extraction_id = asyncio.run(_persist())

        return {
            "filename": filename,
            "structure_count": len(substances),
            "extraction_id": extraction_id,
            "error": None,
        }

    except SoftTimeLimitExceeded:
        # Both primary and fallback exceeded the time limit
        logger.error("Batch extraction timed out for %s (>120s)", filename)
        return {
            "filename": filename,
            "structure_count": 0,
            "extraction_id": None,
            "error": f"Extraction timed out after 120 seconds: {filename}",
        }

    except Exception as exc:
        logger.error("Batch extraction failed for %s: %s", filename, exc)
        return {
            "filename": filename,
            "structure_count": 0,
            "extraction_id": None,
            "error": str(exc)[:200],
        }
