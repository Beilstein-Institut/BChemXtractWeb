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
