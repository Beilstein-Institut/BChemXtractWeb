/**
 * TypeScript interfaces mirroring the backend Pydantic models in
 * backend/app/models/chemistry.py. Field names are snake_case to match
 * FastAPI's JSON serialization defaults.
 */

export interface SubstanceResponse {
  id: number;
  inchi: string;
  inchi_key: string;
  smiles: string;
  extended_smiles: string;
  iupac_name: string;
  molecular_formula: string;
  aux_info: string;
  mdlv3000: string;
  abbreviations: Record<string, string>;
  svg: string; // CDK-generated 2D layout (clean, no crossing bonds)
  svg_cdx?: string; // original ChemDraw coordinates (may have crossing bonds)
}

/**
 * 2D layout used when displaying or exporting structure images.
 * Mirrors the backend `DepictionLiteral`:
 *   "cdx" — original ChemDraw coordinates (`svg_cdx`)
 *   "cdk" — fresh CDK canonical layout (`svg`)
 */
export type Depiction = "cdx" | "cdk";

export interface SubstanceInfoResponse {
  no_fragments: number;
  no_inchis: number;
  no_substances: number;
}

export interface ExtractionResponse {
  substances: SubstanceResponse[];
  info: SubstanceInfoResponse;
  format: string;
  filename: string;
  file_size: number;
  structure_count: number;
  extraction_time_ms: number;
  warnings: string[];
  extraction_id?: number;
}

export interface PagedSubstancesResponse {
  items: SubstanceResponse[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/**
 * One component of a reaction (reactant, product, or agent).
 * Mirrors backend ReactionComponentResponse.
 */
export interface ReactionComponentResponse {
  inchi: string;
  inchi_key: string;
  cdx_top: number;
  cdx_left: number;
  cdx_bottom: number;
  cdx_right: number;
}

/**
 * One extracted reaction — mirrors backend ReactionResponse.
 * svg is the CDK-rendered depiction ("" when rendering failed for this reaction).
 */
export interface ReactionResponse {
  rinchi: string;
  rinchi_key: string;
  short_rinchi_key: string;
  long_rinchi_key: string;
  web_rinchi_key: string;
  reaction_smiles: string;
  aux_info: string;
  reactants: ReactionComponentResponse[];
  products: ReactionComponentResponse[];
  agents: ReactionComponentResponse[];
  svg: string;
}

/**
 * Response envelope for POST /api/reactions and GET /api/extractions/{id}/reactions.
 * Mirrors backend ReactionExtractionResponse.
 *
 * Timeout contract: a 200 with `reactions: []` and non-empty `warnings`
 * indicates the extraction exceeded the configured timeout and was aborted.
 */
export interface ReactionExtractionResponse {
  reactions: ReactionResponse[];
  format: string;
  filename: string;
  file_size: number;
  reaction_count: number;
  extraction_time_ms: number;
  warnings: string[];
  extraction_id?: number;
}
