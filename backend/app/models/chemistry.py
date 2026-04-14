"""Pydantic models for extracted chemical data.

All fields are guaranteed non-null by the DTO coercion layer (D-09).
Downstream code never needs to check for None.
"""

from pydantic import BaseModel, Field


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
