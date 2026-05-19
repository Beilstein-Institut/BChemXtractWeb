"""Pydantic models for extracted chemical data.

All fields are guaranteed non-null by the DTO coercion layer (D-09).
Downstream code never needs to check for None.
"""

from typing import Literal

from pydantic import BaseModel, Field

# Phase 11 D-22 / PRIV-13: substances.first_seen_at and reactions.first_seen_at
# are intentionally NOT in the response shape below. The columns remain in the
# DB (see backend/app/models/orm.py) for ops/forensics. Adding the field here
# would re-expose dedup-presence information across sessions, leaking that
# user A submitted a molecule before user B did.


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
    # Plan 10 D-04 amended: CDK-rendered combined reaction SVG (D-12/D-15).
    svg: str = ""


class SubstanceInfoResponse(BaseModel):
    """Extraction statistics from BCXSubstanceInfo."""

    no_fragments: int = 0
    no_inchis: int = 0
    no_substances: int = 0


class ExtractionResponse(BaseModel):
    """Full extraction result including substances, metadata, and warnings.

    Matches the D-10 response shape for the single-file extraction endpoint.
    """

    substances: list[SubstanceResponse]
    info: SubstanceInfoResponse
    format: str
    filename: str
    file_size: int
    structure_count: int
    extraction_time_ms: float
    warnings: list[str] = Field(default_factory=list)
    extraction_id: int | None = None


class ReactionExtractionResponse(BaseModel):
    """Full reaction extraction result for POST /api/reactions (Plan 10, D-04).

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
    """One entry in the extraction history list (D-04).

    Returned by GET /api/history. Contains only the summary fields
    needed to render HistoryList and HistoryEntry components.
    """

    id: int
    filename: str
    file_size: int
    format: str
    structure_count: int
    # Plan 10 D-23 — populated by save_reactions; 0 until reactions extracted.
    reaction_count: int = 0
    extraction_time_ms: float
    warnings: list[str] = Field(default_factory=list)
    created_at: str  # ISO 8601 UTC string


class HistoryListResponse(BaseModel):
    """Response shape for GET /api/history."""

    items: list[HistoryListItem]
    total: int


class StatsResponse(BaseModel):
    """Response shape for GET /api/stats (D-08).

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


ExportFormatLiteral = Literal["sdf", "json", "csv", "png", "svg", "v3000", "rxn"]


class ExportRequest(BaseModel):
    """Request body for POST /api/export (D-08).

    substance_ids: explicit selection (D-01, D-02, D-04). Capped at 1000
        entries to bound JVM thread-pool fan-out and response size (SEC H-06).
    extraction_id: export all from this extraction (D-03) — used when
        substance_ids is empty.
    format: one of the six export formats plus rxn stub.
    reaction_ids: explicit reaction selection for RXN export (Plan 10 D-22).
        Capped at 500 entries for the same reason as ``substance_ids``.
    """

    format: ExportFormatLiteral
    substance_ids: list[int] = Field(default_factory=list, max_length=1000)
    extraction_id: int | None = None
    reaction_ids: list[int] = Field(default_factory=list, max_length=500)


# ============================================================================
# Phase 9: Search & API — search request/response + unified ErrorResponse
# ============================================================================

SearchType = Literal["auto", "inchi_key", "formula", "smiles", "substructure"]
SearchMatch = Literal["canonical", "literal"]


class SearchRequest(BaseModel):
    """POST /api/search request body (D-14).

    query: user input; 500-char cap bounds ReDoS + DoS.
    type: 'auto' lets backend detect (D-01). Explicit values override.
    scope: 'global' default; 'extraction:{id}' restricts to one extraction (D-20).
    match: canonical (default) vs literal — only meaningful for type=smiles.
    page/size: pagination; capped per D-14 response shape.
    """

    query: str = Field(..., min_length=1, max_length=500)
    type: SearchType = "auto"
    scope: str = Field("global", max_length=80)
    match: SearchMatch = "canonical"
    page: int = Field(1, ge=1, le=1000)
    size: int = Field(24, ge=1, le=100)
    # New in 2026-04-24 substructure redesign. Defaults to False per
    # user-confirmed design decision ("ignore stereo by default, opt-in
    # toggle"). Ignored for non-substructure types.
    stereo: bool = False


class SearchExtractionRef(BaseModel):
    """One extraction where a matched substance was seen (D-10 attribution)."""

    extraction_id: int
    filename: str
    created_at: str  # ISO 8601 UTC


class SearchResult(BaseModel):
    """One search hit — substance + attribution + optional match highlight."""

    substance: SubstanceResponse
    extraction_count: int = 0
    extractions: list[SearchExtractionRef] = Field(default_factory=list)
    # Populated only for type='substructure' hits (D-13).
    # Plan 04 will wire match_svg (highlight depiction); Plan 03 leaves it None.
    match_svg: str | None = None
    match_atom_indices: list[int] = Field(default_factory=list)
    # New in 2026-04-24. Per-mapping-reconstructed bond indices. Empty
    # list for non-substructure hits (canonical/InChI/formula queries).
    match_bond_indices: list[int] = Field(default_factory=list)
    # New in 2026-04-24. True when the mapping cap was hit on this hit;
    # frontend renders a "partial highlight" sub-badge.
    partial_match: bool = False


class SearchResponse(BaseModel):
    """POST /api/search response (D-14)."""

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
    """Unified error response shape across all /api/* endpoints (D-17).

    detail: human-readable message, always present and always the first field
      so the existing frontend apiClient (reads body.detail) keeps working.
    code: machine-stable error code (UPPER_SNAKE_CASE). Clients key off this
      for programmatic handling.
    fields: optional per-field validation map (only populated for 422).
    """

    detail: str
    code: str
    fields: dict[str, list[str]] | None = None
