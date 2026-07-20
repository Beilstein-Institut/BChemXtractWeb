"""Pydantic models for extracted chemical data.

All fields are guaranteed non-null by the DTO coercion layer.
Downstream code never needs to check for None.
"""

from typing import Literal

from pydantic import BaseModel, Field

# substances.first_seen_at and reactions.first_seen_at
# are intentionally NOT in the response shape below. The columns remain in the
# DB (see backend/app/models/orm.py) for ops/forensics. Adding the field here
# would re-expose dedup-presence information across sessions, leaking that
# user A submitted a molecule before user B did.


class Occurrence(BaseModel):
    """One on-page bounding box (CDX coords) where a substance appears."""

    l: float = 0.0  # noqa: E741 (l/t/r/b mirror the frontend Rect wire contract)
    t: float = 0.0
    r: float = 0.0
    b: float = 0.0


class SubstanceResponse(BaseModel):
    """Extracted chemical substance with all fields guaranteed non-null."""

    id: int = 0
    inchi: str = ""
    inchi_key: str = ""
    smiles: str = ""
    extended_smiles: str = ""
    iupac_name: str = ""
    molecular_formula: str = ""
    aux_info: str = ""
    mdlv3000: str = ""
    abbreviations: dict[str, str] = Field(default_factory=dict)
    svg: str = ""
    svg_cdx: str = ""
    occurrences: list[Occurrence] = Field(default_factory=list)


class ReactionComponentResponse(BaseModel):
    """A component (reactant/product/agent) of a reaction."""

    inchi: str = ""
    inchi_key: str = ""
    cdx_top: float = 0.0
    cdx_left: float = 0.0
    cdx_bottom: float = 0.0
    cdx_right: float = 0.0


class ReactionResponse(BaseModel):
    """Extracted chemical reaction with all fields guaranteed non-null."""

    rinchi: str = ""
    rinchi_key: str = ""
    short_rinchi_key: str = ""
    long_rinchi_key: str = ""
    web_rinchi_key: str = ""
    reaction_smiles: str = ""
    aux_info: str = ""
    reactants: list[ReactionComponentResponse] = Field(default_factory=list)
    products: list[ReactionComponentResponse] = Field(default_factory=list)
    agents: list[ReactionComponentResponse] = Field(default_factory=list)
    # CDK-rendered combined reaction SVG.
    svg: str = ""


class SubstanceInfoResponse(BaseModel):
    """Extraction statistics from BCXSubstanceInfo."""

    no_fragments: int = 0
    no_inchis: int = 0
    no_substances: int = 0


class ExtractionResponse(BaseModel):
    """Full extraction result including substances, metadata, and warnings.

    Matches the response shape for the single-file extraction endpoint.
    """

    substances: list[SubstanceResponse]
    info: SubstanceInfoResponse
    format: str
    filename: str
    file_size: int
    structure_count: int
    extraction_time_ms: float
    warnings: list[str] = Field(default_factory=list)
    # Distinct ChemDraw abbreviations expanded across the file. Persisted as an
    # aggregate count because per-substance abbreviations are not stored (the
    # substances table is deduplicated globally by InChIKey).
    abbreviation_count: int = 0
    extraction_id: int | None = None


class ReactionExtractionResponse(BaseModel):
    """Full reaction extraction result for POST /api/reactions.

    Parallels ExtractionResponse but reactions-centric. reaction_count replaces
    structure_count; no SubstanceInfoResponse block.
    """

    reactions: list[ReactionResponse]
    format: str
    filename: str
    file_size: int
    reaction_count: int
    extraction_time_ms: float
    warnings: list[str] = Field(default_factory=list)
    extraction_id: int | None = None


class PagedSubstancesResponse(BaseModel):
    """Paginated page of substances for GET /api/extractions/{id}/substances."""

    items: list[SubstanceResponse]
    total: int
    page: int
    size: int
    pages: int


class HistoryListItem(BaseModel):
    """One entry in the extraction history list.

    Returned by GET /api/history. Contains only the summary fields
    needed to render HistoryList and HistoryEntry components.
    """

    id: int
    filename: str
    file_size: int
    format: str
    structure_count: int
    # Populated by save_reactions; 0 until reactions extracted.
    reaction_count: int = 0
    extraction_time_ms: float
    warnings: list[str] = Field(default_factory=list)
    created_at: str  # ISO 8601 UTC string


class HistoryListResponse(BaseModel):
    """Response shape for GET /api/history."""

    items: list[HistoryListItem]
    total: int


class StatsResponse(BaseModel):
    """Response shape for GET /api/stats.

    Counts total extractions, unique substances, and identifies the most
    frequently occurring molecular formula across all stored substances.
    """

    total_extractions: int
    unique_structures: int
    most_common_formula: str  # "" when no substances exist


class BatchStartResponse(BaseModel):
    """Response from POST /api/batch.

    batch_id: UUID stored on each Extraction row — used for ZIP download.
    group_id: Celery GroupResult.id — used for SSE progress and cancel.
    task_ids: individual AsyncResult IDs, one per file.
    """

    batch_id: str
    group_id: str
    task_ids: list[str]
    file_count: int


class BatchExtractionItem(BaseModel):
    """One extraction in a batch — summary fields for the combined view."""

    extraction_id: int
    filename: str
    structure_count: int


class BatchExtractionsResponse(BaseModel):
    """Response from GET /api/batch/{batch_id}.

    Lists the extractions belonging to a batch (RLS-scoped to the caller),
    in upload order. Substances are NOT included — the combined view fetches
    each extraction's full detail via GET /api/history/{id}.
    """

    batch_id: str
    files: list[BatchExtractionItem]


class ExtractJobResponse(BaseModel):
    """Response from POST /api/extract/jobs — async single-file extraction.

    The browser submits a file, gets back a ``task_id`` immediately (so no
    proxy/gateway can time out a long-held connection), then polls
    GET /api/extract/jobs/{task_id} until the extraction finishes.
    """

    task_id: str


class ExtractJobStatusResponse(BaseModel):
    """Response from GET /api/extract/jobs/{task_id}.

    ``state`` is "processing" until the worker finishes; then "done" (with
    ``extraction_id`` — fetch the full result via GET /api/history/{id}) or
    "failed" (with a human-readable ``error``).
    """

    state: Literal["processing", "done", "failed"]
    extraction_id: int | None = None
    error: str | None = None


ExportFormatLiteral = Literal["sdf", "json", "tsv", "png", "svg", "v3000", "rxn"]

# Which 2D layout the image formats (png/svg) use:
#   "cdk" — fresh CDK canonical layout (stored ``svg`` column)
#   "cdx" — original ChemDraw coordinates (stored ``svg_cdx`` column)
# Mirrors the per-substance dual-render semantics from extractor.py.
DepictionLiteral = Literal["cdk", "cdx"]


class ExportRequest(BaseModel):
    """Request body for POST /api/export.

    substance_ids: explicit selection. Capped at 1000
        entries to bound JVM thread-pool fan-out and response size.
    extraction_id: export all from this extraction — used when
        substance_ids is empty.
    format: one of the six export formats plus rxn stub.
    reaction_ids: explicit reaction selection for RXN export.
        Capped at 500 entries for the same reason as ``substance_ids``.
    depiction: 2D layout used by the image formats (png/svg). Defaults to
        "cdk" so pre-existing API clients keep their current output;
        the web UI sends its active depiction toggle explicitly.
        Ignored by the non-image formats.
    sort: substance ordering for the exported file. "extraction_order"
        (default, preserves pre-existing API output) keeps original position
        order; "formula" applies the same element-aware Hill ordering the
        browse view uses, so an exported file matches what the user sees.
    """

    format: ExportFormatLiteral
    substance_ids: list[int] = Field(default_factory=list, max_length=1000)
    extraction_id: int | None = None
    reaction_ids: list[int] = Field(default_factory=list, max_length=500)
    depiction: DepictionLiteral = "cdk"
    sort: Literal["extraction_order", "formula"] = "extraction_order"


# ============================================================================
# Search & API — search request/response + unified ErrorResponse
# ============================================================================

SearchType = Literal["auto", "inchi_key", "formula", "smiles", "substructure"]
SearchMatch = Literal["canonical", "literal"]


class SearchRequest(BaseModel):
    """POST /api/search request body.

    query: user input; 500-char cap bounds ReDoS + DoS.
    type: 'auto' lets backend detect. Explicit values override.
    scope: 'global' default; 'extraction:{id}' restricts to one extraction.
    match: canonical (default) vs literal — only meaningful for type=smiles.
    page/size: pagination; capped by the response shape.
    """

    query: str = Field(..., min_length=1, max_length=500)
    type: SearchType = "auto"
    scope: str = Field("global", max_length=80)
    match: SearchMatch = "canonical"
    page: int = Field(1, ge=1, le=1000)
    size: int = Field(24, ge=1, le=100)
    # Added for substructure search. Defaults to False
    # ("ignore stereo by default, opt-in toggle"). Ignored for
    # non-substructure types.
    stereo: bool = False


class SearchExtractionRef(BaseModel):
    """One extraction where a matched substance was seen (attribution)."""

    extraction_id: int
    filename: str
    created_at: str  # ISO 8601 UTC


class SearchResult(BaseModel):
    """One search hit — substance + attribution + optional match highlight."""

    substance: SubstanceResponse
    extraction_count: int = 0
    extractions: list[SearchExtractionRef] = Field(default_factory=list)
    # Populated only for type='substructure' hits.
    # match_svg carries the depiction with the matched substructure
    # highlighted; None for non-substructure hits.
    match_svg: str | None = None
    match_atom_indices: list[int] = Field(default_factory=list)
    # Per-mapping-reconstructed bond indices. Empty
    # list for non-substructure hits (canonical/InChI/formula queries).
    match_bond_indices: list[int] = Field(default_factory=list)
    # True when the mapping cap was hit on this hit;
    # frontend renders a "partial highlight" sub-badge.
    partial_match: bool = False


class SearchResponse(BaseModel):
    """POST /api/search response."""

    results: list[SearchResult]
    total: int = 0
    page: int = 1
    size: int = 24
    warnings: list[str] = Field(default_factory=list)


class SearchValidateRequest(BaseModel):
    """POST /api/search/validate body. Cheap, parse-only — no DB."""

    query: str = Field(..., min_length=1, max_length=500)
    stereo: bool = False


class SearchValidateResponse(BaseModel):
    """Response for POST /api/search/validate."""

    valid: bool
    language: Literal["smiles", "smarts"] | None = None
    atom_count: int = 0
    error: str | None = None


class ErrorResponse(BaseModel):
    """Unified error response shape across all /api/* endpoints.

    detail: human-readable message, always present and always the first field
      so the existing frontend apiClient (reads body.detail) keeps working.
    code: machine-stable error code (UPPER_SNAKE_CASE). Clients key off this
      for programmatic handling.
    fields: optional per-field validation map (only populated for 422).
    """

    detail: str
    code: str
    fields: dict[str, list[str]] | None = None


# ============================================================================
# PubChem enrichment — request/response models (kept SEPARATE from
# SubstanceResponse so PubChem-derived data never overwrites BChemXtract
# fields; provenance stays unambiguous).
# ============================================================================

PubChemStatus = Literal["exact", "scaffold", "absent"]

# InChIKey grammar: 14-char connectivity block, optional 10-char block,
# optional final char — uppercase letters + hyphens only. Anchored so a
# request body cannot smuggle path separators / query chars (``/`` ``..``
# ``?`` ``#``) into the outbound PubChem URL path (see app.services.pubchem).
# Mirrors ``app.services.search._INCHI_KEY_RE``.
INCHI_KEY_PATTERN = r"^[A-Z]{14}(?:-[A-Z]{10}(?:-[A-Z])?)?$"


class PubChemEnrichItem(BaseModel):
    """One structure to enrich. ``smiles`` is required for the scaffold
    (same_connectivity) fallback when the exact InChIKey misses."""

    inchi_key: str = Field(..., max_length=27, pattern=INCHI_KEY_PATTERN)
    smiles: str = Field("", max_length=4000)


class PubChemEnrichRequest(BaseModel):
    """POST /api/pubchem/enrich body. Batch capped to bound external fan-out."""

    items: list[PubChemEnrichItem] = Field(..., min_length=1, max_length=50)


class PubChemEnrichment(BaseModel):
    """Per-structure PubChem result.

    Tier-1 (card/badge) fields are populated by POST /api/pubchem/enrich.
    Tier-2 (detail) fields — title, synonyms, description, description_source
    — stay empty/None until GET /api/pubchem/compound/{inchi_key} fills them.
    """

    inchi_key: str
    status: PubChemStatus
    cid: int | None = None
    iupac_name: str | None = None
    molecular_formula: str | None = None
    molecular_weight: float | None = None
    canonical_smiles: str | None = None
    isomeric_smiles: str | None = None
    xlogp: float | None = None
    pubchem_url: str | None = None
    connectivity_cid_count: int = 0
    # Tier-2 (detail) fields.
    title: str | None = None
    synonyms: list[str] = Field(default_factory=list)
    description: str | None = None
    description_source: str | None = None


class PubChemEnrichResponse(BaseModel):
    """POST /api/pubchem/enrich response — keyed by InChIKey."""

    results: dict[str, PubChemEnrichment] = Field(default_factory=dict)


class PubChemStatusResponse(BaseModel):
    """GET /api/pubchem/status response.

    Lets the frontend learn whether the server feature flag is on WITHOUT
    firing an enrichment request that would 503. When ``enabled`` is False the
    UI hides the opt-in and never calls the enrich/compound endpoints.
    """

    enabled: bool


class InchiRequest(BaseModel):
    """POST /api/inchi body — compute InChI for a single SMILES on demand.

    Used by the structure sheet's "Generate InChI" action for substances whose
    InChI was skipped at extraction time. The length cap is generous (large
    legitimate molecules are the whole point) but bounds obvious abuse.
    """

    smiles: str = Field(..., min_length=1, max_length=50_000)


class InchiResponse(BaseModel):
    """POST /api/inchi response — the computed InChI + its (real) InChIKey."""

    inchi: str
    inchi_key: str
