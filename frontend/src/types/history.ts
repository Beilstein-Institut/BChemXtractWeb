/**
 * TypeScript interfaces for extraction history and statistics (Phase 5).
 * Mirrors backend Pydantic models: HistoryListItem, HistoryListResponse, StatsResponse.
 */

export interface HistoryListItem {
  id: number;
  filename: string;
  file_size: number;
  format: string;
  structure_count: number;
  extraction_time_ms: number;
  warnings: string[];
  created_at: string; // ISO 8601 UTC string
  // Plan 10 D-23: count of reactions extracted for this file (0 until user runs /api/reactions).
  reaction_count: number;
}

export interface HistoryListResponse {
  items: HistoryListItem[];
  total: number;
}

export interface StatsResponse {
  total_extractions: number;
  unique_structures: number;
  most_common_formula: string;
}
