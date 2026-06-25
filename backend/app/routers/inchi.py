"""POST /api/inchi — compute an InChI for a single SMILES on demand.

Backs the structure sheet's "Generate InChI" action. Extraction skips InChI
for very large molecules (xtractUnique times out and the molecule is over the
auto-recovery size cap), leaving a SMILES-hash surrogate key and no InChI.
This endpoint lets the user explicitly compute it for the structure on screen.

Stateless: it does not touch the database — it returns the computed InChI +
real InChIKey for the supplied SMILES and the frontend shows them in the open
sheet. The compute is bounded by a timeout (large cages can exceed it and
return 503); all error paths flow through the unified handlers in ``main.py``.
"""

import logging

from fastapi import APIRouter, Request

from app.config import settings
from app.errors import InvalidSmilesError
from app.middleware.rate_limit import limiter
from app.models.chemistry import ErrorResponse, InchiRequest, InchiResponse
from app.services.extractor import compute_inchi

logger = logging.getLogger(__name__)

router = APIRouter(tags=["inchi"])


@router.post(
    "/inchi",
    response_model=InchiResponse,
    operation_id="computeInchi",
    summary="Compute an InChI + InChIKey for a SMILES on demand",
    description=(
        "Compute the InChI and (real) InChIKey for a single SMILES. Used by "
        "the structure detail sheet to fill in an InChI that was skipped at "
        "extraction time for a very large molecule. Stateless — nothing is "
        "stored. Very large structures may exceed the compute budget and "
        "return 503."
    ),
    responses={
        200: {"description": "Computed InChI + InChIKey."},
        422: {
            "model": ErrorResponse,
            "description": "CDK could not produce an InChI for this SMILES.",
        },
        503: {
            "model": ErrorResponse,
            "description": "Structure too large to compute within the time limit.",
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
)
@limiter.limit(settings.rate_limit_search)
async def post_inchi(request: Request, payload: InchiRequest) -> InchiResponse:
    """Compute InChI for ``payload.smiles``; 422 when CDK can't, 503 on timeout."""
    inchi, inchi_key = await compute_inchi(payload.smiles)
    if not inchi:
        raise InvalidSmilesError(
            "Could not compute an InChI for this structure — CDK could not "
            "parse the SMILES."
        )
    return InchiResponse(inchi=inchi, inchi_key=inchi_key)
