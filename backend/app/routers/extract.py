"""Single-file extraction endpoint for CDX/CDXML uploads.

POST /api/extract accepts a ChemDraw file via multipart/form-data, detects
the format from content (D-06), extracts substances with SVG depictions,
and returns ExtractionResponse JSON with metadata and optional warnings.
"""

import logging
import time
from typing import Annotated

from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.errors import FileSizeError
from app.models.chemistry import ExtractionResponse
from app.services.db import get_db
from app.services.extractor import extract_substances_with_svg
from app.services.format_detector import detect_format
from app.services.persistence import save_extraction

logger = logging.getLogger(__name__)

EXTENSION_FORMAT_MAP: dict[str, str] = {
    ".cdx": "cdx",
    ".cdxml": "cdxml",
}


def _check_extension_mismatch(filename: str, detected_format: str) -> list[str]:
    """Return warnings if file extension doesn't match detected format.

    Per D-07: extension mismatch is a warning, not an error. The content-based
    detection (D-06) is authoritative.

    Args:
        filename: Original upload filename.
        detected_format: Format detected from content ("cdx" or "cdxml").

    Returns:
        List of warning strings (empty if no mismatch).
    """
    ext = ""
    if "." in filename:
        ext = "." + filename.rsplit(".", 1)[-1].lower()
    expected = EXTENSION_FORMAT_MAP.get(ext)
    if expected is not None and expected != detected_format:
        ext_label = "CDX binary" if expected == "cdx" else "CDXML"
        detected_label = "CDX binary" if detected_format == "cdx" else "CDXML"
        return [
            f"File extension suggests {ext_label} but content detected as "
            f"{detected_label}. Processing as {detected_label}."
        ]
    return []


router = APIRouter(tags=["extract"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("/extract", response_model=ExtractionResponse)
async def extract_file(file: UploadFile, db: DbDep) -> ExtractionResponse:
    """Extract chemical substances from a CDX/CDXML file upload.

    Accepts a single file via multipart/form-data. Detects format from
    content (D-06), extracts substances with SVG depictions, and returns
    a structured response with metadata and optional warnings.

    Args:
        file: The uploaded CDX or CDXML file.

    Returns:
        ExtractionResponse with substances, SVGs, metadata, and warnings.

    Raises:
        FileSizeError: If file exceeds max_upload_size (D-05, HTTP 413).
        FormatDetectionError: If file is not CDX or CDXML (HTTP 415).
        ExtractionError: If Java extraction fails (HTTP 422).
    """
    # D-05: Size check before JVM processing
    # file.size comes from Content-Length header (may be None for streaming)
    if file.size is not None and file.size > settings.max_upload_size:
        raise FileSizeError(
            f"File exceeds the {settings.max_upload_size // (1024 * 1024)} MB "
            f"size limit. Please upload a smaller file."
        )

    file_bytes = await file.read()

    # Fallback size check after reading (in case Content-Length was absent)
    if len(file_bytes) > settings.max_upload_size:
        raise FileSizeError(
            f"File exceeds the {settings.max_upload_size // (1024 * 1024)} MB "
            f"size limit. Please upload a smaller file."
        )

    start = time.perf_counter()

    # D-06: Content-based format detection is authoritative
    format_type = detect_format(file_bytes)

    # D-07: Extension mismatch warning (not error)
    warnings: list[str] = []
    if file.filename:
        warnings.extend(_check_extension_mismatch(file.filename, format_type))

    # D-08: Substances only (reactions are Phase 10)
    # D-01: SVGs inline in response
    substances, info = await extract_substances_with_svg(file_bytes, format_type)

    elapsed_ms = (time.perf_counter() - start) * 1000

    # D-04: Synchronous response with timing metadata
    # D-09: File metadata in response
    # D-10: Full response shape
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

    # D-03: Auto-persist every extraction to PostgreSQL.
    # DB save is best-effort: failures are logged but never break extraction.
    try:
        await save_extraction(db, response)
    except Exception:
        logger.exception("Auto-persist failed for %s — extraction result still returned", file.filename)

    return response
