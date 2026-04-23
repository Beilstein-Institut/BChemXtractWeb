/**
 * HistoryPage stats reducer — extracted from HistoryPage.tsx so the
 * page module only exports components (react-refresh/only-export-
 * components). Tests import this directly.
 *
 * Consumes:
 *   - `entries`  — the currently loaded slice of history rows.
 *   - `stats`    — server-side aggregate (may be null while the initial
 *                  fetch is still in flight).
 *   - `total`    — server-side total count from the history endpoint.
 *
 * Returns the four numbers the bento top-bar renders. See HistoryPage
 * for the stat-to-tile mapping.
 */
import type { HistoryListItem, StatsResponse } from "@/types/history";

export interface ComputedHistoryStats {
  totalExtractions: number;
  structuresFound: number;
  reactionsFound: number;
  /** Milliseconds. */
  avgProcessingTimeMs: number;
}

/** Pure reducer. Exported for tests. */
export function computeHistoryStats(
  entries: ReadonlyArray<HistoryListItem>,
  stats: StatsResponse | null,
  total: number,
): ComputedHistoryStats {
  const sampled = entries.length;
  const totalExtractions = Math.max(stats?.total_extractions ?? 0, total, sampled);
  const structuresFound =
    stats?.unique_structures ?? entries.reduce((acc, e) => acc + (e.structure_count ?? 0), 0);
  const reactionsFound = entries.reduce((acc, e) => acc + (e.reaction_count ?? 0), 0);
  const avgProcessingTimeMs =
    sampled === 0 ? 0 : entries.reduce((acc, e) => acc + (e.extraction_time_ms ?? 0), 0) / sampled;
  return {
    totalExtractions,
    structuresFound,
    reactionsFound,
    avgProcessingTimeMs,
  };
}
