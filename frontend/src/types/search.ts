/**
 * TS mirrors of backend Pydantic search models (backend/app/models/chemistry.py).
 *
 * Keep these in lockstep with the backend:
 *   SearchType, SearchMatch       — Literal unions
 *   SearchRequest                 — POST /api/search body
 *   SearchExtractionRef           — one extraction where a hit was seen
 *   SearchResult                  — one hit with attribution + highlight
 *   SearchResponse                — paginated response
 *   ErrorResponse                 — unified error shape (D-17, Plan 05)
 */
import type { SubstanceResponse } from "@/types/chemistry";

export type SearchType = "auto" | "inchi_key" | "formula" | "smiles" | "substructure";

export type SearchMatch = "canonical" | "literal";

export interface SearchRequest {
  query: string;
  type?: SearchType;
  scope?: string; // "global" | "extraction:{id}"
  match?: SearchMatch;
  page?: number;
  size?: number;
}

export interface SearchExtractionRef {
  extraction_id: number;
  filename: string;
  created_at: string; // ISO 8601
}

export interface SearchResult {
  substance: SubstanceResponse;
  extraction_count: number;
  extractions: SearchExtractionRef[];
  match_svg: string | null;
  match_atom_indices: number[];
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
