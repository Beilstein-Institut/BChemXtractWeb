"""POST /api/search — unified search endpoint (D-14).

Body: :class:`app.models.chemistry.SearchRequest`
      (``{query, type, scope, match, page, size}``).
Response: :class:`app.models.chemistry.SearchResponse`
      (``{results, total, page, size, warnings}``).

Per D-16: ``operation_id``, ``summary``, ``description``, ``responses``, and
``tags`` are populated at definition time so ``/docs`` and ``/redoc`` render
a curated spec.

All error paths flow through the unified exception handlers registered in
``main.py`` (Plan 05). Pydantic 422 validation fires automatically for bad
request bodies (out-of-range ``page``, empty ``query``, unknown ``type``).
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.middleware.rate_limit import limiter
from app.models.chemistry import (
    ErrorResponse,
    SearchRequest,
    SearchResponse,
    SearchValidateRequest,
    SearchValidateResponse,
)
from app.services.db import get_db
from app.services.jvm_bridge import run_in_jvm_thread
from app.services.search import execute_search
from app.services.substructure import validate_query

logger = logging.getLogger(__name__)

router = APIRouter(tags=["search"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post(
    "/search",
    response_model=SearchResponse,
    operation_id="searchSubstances",
    summary="Search substances across all stored extractions",
    description=(
        "Search all deduplicated substances by InChI key, molecular "
        "formula, canonical SMILES, or SMARTS substructure. Set "
        "`type='auto'` to let the server infer the query type from the "
        "input pattern.\n\n"
        "**Scale note:** substructure search iterates every stored "
        "candidate substance inside the JVM. Expect ~300 ms - 2 s on "
        "libraries of up to ~2000 substances. Future revisions will move "
        "to a PostgreSQL chemistry cartridge for larger scale. Stored "
        "SMILES longer than 1500 characters are excluded from "
        "substructure iteration to avoid a CDK/JVM deadlock on polymer "
        "inputs; they are counted in the response `warnings`."
    ),
    responses={
        200: {
            "description": "Paginated search results with attribution.",
            "content": {
                "application/json": {
                    "example": {
                        "results": [
                            {
                                "substance": {
                                    "id": 42,
                                    "inchi_key": "UHOVQNZJYSORNB-UHFFFAOYSA-N",
                                    "smiles": "c1ccccc1",
                                    "molecular_formula": "C6H6",
                                    "svg": "<svg>...</svg>",
                                },
                                "extraction_count": 2,
                                "extractions": [
                                    {
                                        "extraction_id": 1,
                                        "filename": "aromatics.cdx",
                                        "created_at": "2026-04-17T10:00:00+00:00",
                                    }
                                ],
                                "match_svg": None,
                                "match_atom_indices": [],
                            }
                        ],
                        "total": 1,
                        "page": 1,
                        "size": 24,
                        "warnings": [],
                    }
                }
            },
        },
        422: {
            "model": ErrorResponse,
            "description": (
                "Invalid query — bad SMARTS, malformed InChI key, "
                "unparseable SMILES, or Pydantic validation failure."
            ),
        },
        503: {
            "model": ErrorResponse,
            "description": "Search exceeded the JVM timeout.",
        },
        500: {
            "model": ErrorResponse,
            "description": "Internal server error.",
        },
    },
)
@limiter.limit(settings.rate_limit_search)
async def post_search(
    request: Request, payload: SearchRequest, db: DbDep
) -> SearchResponse:
    """Execute a search and return paginated results + attribution."""
    return await execute_search(payload, db)


@router.post(
    "/search/validate",
    response_model=SearchValidateResponse,
    operation_id="validateSearchQuery",
    summary="Parse-only validate a substructure query",
    description=(
        "Validates a SMILES or SMARTS substructure query by running it "
        "through the CDK parser. Returns shape + atom count when valid, "
        "an error message when not. Intended for live-typing UX — the "
        "frontend only fires the main search once this returns valid."
    ),
    responses={
        200: {"description": "Validation result (valid=true or valid=false)"},
        422: {
            "model": ErrorResponse,
            "description": "Pydantic validation failure (e.g. empty query)",
        },
    },
)
@limiter.limit(settings.rate_limit_search)
async def post_search_validate(
    request: Request, payload: SearchValidateRequest
) -> SearchValidateResponse:
    """Parse-only validation of a substructure query."""
    result = await run_in_jvm_thread(
        validate_query, payload.query, match_stereo=payload.stereo
    )
    return SearchValidateResponse(
        valid=result.valid,
        language=result.language,
        atom_count=result.atom_count,
        error=result.error,
    )
