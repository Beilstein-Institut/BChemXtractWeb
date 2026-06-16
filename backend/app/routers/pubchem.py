"""PubChem enrichment endpoints.

POST /api/pubchem/enrich          — tier-1 batch (badge/card data).
GET  /api/pubchem/compound/{key}  — tier-2 single (rich detail panel).

Both are gated by ``settings.pubchem_enabled`` (ops kill-switch). Privacy:
calling these sends InChIKeys (and connectivity SMILES) to NCBI PubChem; the
frontend only calls them when the user has opted in.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.errors import InvalidInchiKeyError, PubChemDisabledError
from app.middleware.rate_limit import limiter
from app.models.chemistry import (
    ErrorResponse,
    PubChemEnrichment,
    PubChemEnrichRequest,
    PubChemEnrichResponse,
)
from app.services import pubchem_enrich
from app.services.audit import audit_log_insert
from app.services.db import get_scoped_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["pubchem"])

DbDep = Annotated[AsyncSession, Depends(get_scoped_db)]

_INCHI_KEY_MAXLEN = 27


def _require_enabled() -> None:
    if not settings.pubchem_enabled:
        raise PubChemDisabledError("PubChem enrichment is disabled on this server.")


@router.post(
    "/pubchem/enrich",
    response_model=PubChemEnrichResponse,
    operation_id="enrichPubChem",
    summary="Resolve a batch of InChIKeys against PubChem (badge level)",
    responses={
        503: {"model": ErrorResponse, "description": "Feature disabled."},
        422: {"model": ErrorResponse, "description": "Validation failure."},
    },
)
@limiter.limit(settings.rate_limit_pubchem)
async def post_enrich(
    request: Request,
    payload: PubChemEnrichRequest,
    db: DbDep,
    background_tasks: BackgroundTasks,
) -> PubChemEnrichResponse:
    _require_enabled()
    results = await pubchem_enrich.enrich_batch(db, payload.items)
    # Audit counts only — never the structures themselves.
    scope = getattr(request.state, "scope", (None, None))
    background_tasks.add_task(
        audit_log_insert,
        "pubchem.lookup",
        scope[0],
        scope[1],
        None,
        request,
        {"count": len(payload.items)},
    )
    return PubChemEnrichResponse(results=results)


@router.get(
    "/pubchem/compound/{inchi_key}",
    response_model=PubChemEnrichment,
    operation_id="getPubChemCompound",
    summary="Full PubChem detail for one InChIKey (detail panel)",
    responses={
        503: {"model": ErrorResponse, "description": "Feature disabled."},
        422: {"model": ErrorResponse, "description": "Malformed InChIKey."},
    },
)
@limiter.limit(settings.rate_limit_pubchem)
async def get_compound(
    request: Request, inchi_key: str, db: DbDep
) -> PubChemEnrichment:
    _require_enabled()
    key = inchi_key.strip().upper()
    if not key or len(key) > _INCHI_KEY_MAXLEN:
        raise InvalidInchiKeyError("Malformed InChIKey.")
    return await pubchem_enrich.enrich_detail(db, key)
