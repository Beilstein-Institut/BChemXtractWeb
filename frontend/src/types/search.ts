import type { SubstanceResponse } from "@/types/chemistry";

export type SearchType = "auto" | "inchi_key" | "formula" | "smiles" | "substructure";
export type SearchMatch = "canonical" | "literal";
export type SearchLanguage = "smiles" | "smarts";

export interface SearchRequest {
  query: string;
  type?: SearchType;
  scope?: string;
  match?: SearchMatch;
  page?: number;
  size?: number;
  /** New in 2026-04-24 redesign — match stereochemistry strictly.
   *  Default false (stereo ignored). */
  stereo?: boolean;
}

export interface SearchExtractionRef {
  extraction_id: number;
  filename: string;
  created_at: string;
}

export interface SearchResult {
  substance: SubstanceResponse;
  extraction_count: number;
  extractions: SearchExtractionRef[];
  match_svg: string | null;
  match_atom_indices: number[];
  /** New in 2026-04-24. Per-mapping-reconstructed bond indices. */
  match_bond_indices: number[];
  /** New in 2026-04-24. True when the mapping cap was hit. */
  partial_match: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  size: number;
  warnings: string[];
}

export interface ErrorResponse {
  detail: string;
  code: string;
  fields?: Record<string, string[]> | null;
}

/** New in 2026-04-24 — POST /api/search/validate body. */
export interface SearchValidateRequest {
  query: string;
  stereo?: boolean;
}

/** New in 2026-04-24 — POST /api/search/validate response. */
export interface SearchValidateResponse {
  valid: boolean;
  language: SearchLanguage | null;
  atom_count: number;
  error: string | null;
}
