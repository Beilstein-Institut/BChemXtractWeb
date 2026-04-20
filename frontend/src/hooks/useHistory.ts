/**
 * History state machine for Phase 5 persistence features.
 * Mirrors useExtract.ts pattern: explicit state enum, useCallback for stable refs.
 *
 * Manages:
 *  - history list fetch (default 10, expand to all)
 *  - delete with optimistic removal
 *  - reload one extraction into the parent StructureGrid
 *  - stats fetch
 */

import { useCallback, useEffect, useState } from "react";
import {
  deleteHistoryEntry,
  getHistory,
  getHistoryDetail,
  getStats,
} from "@/lib/apiClient";
import type { ExtractionResponse } from "@/types/chemistry";
import type { HistoryListItem, StatsResponse } from "@/types/history";

export type HistoryState = "idle" | "loading" | "success" | "error";

export interface UseHistoryReturn {
  historyState: HistoryState;
  entries: HistoryListItem[];
  total: number;
  showAll: boolean;
  stats: StatsResponse | null;
  statsLoading: boolean;
  toggleShowAll: () => void;
  deleteEntry: (id: number) => Promise<void>;
  reloadEntry: (id: number) => Promise<ExtractionResponse>;
  refresh: () => void;
}

export function useHistory(): UseHistoryReturn {
  const [historyState, setHistoryState] = useState<HistoryState>("idle");
  const [entries, setEntries] = useState<HistoryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchHistory = useCallback(async (all: boolean) => {
    setHistoryState("loading");
    try {
      const data = await getHistory(all ? "all" : 10);
      setEntries(data.items);
      setTotal(data.total);
      setHistoryState("success");
    } catch {
      setHistoryState("error");
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await getStats());
    } catch {
      // Stats failure is non-fatal — keep existing stats or null.
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Initial fetch on mount.
  useEffect(() => {
    fetchHistory(false);
    fetchStats();
  }, [fetchHistory, fetchStats]);

  const toggleShowAll = useCallback(() => {
    setShowAll((prev) => {
      const next = !prev;
      fetchHistory(next);
      return next;
    });
  }, [fetchHistory]);

  const deleteEntry = useCallback(
    async (id: number) => {
      await deleteHistoryEntry(id);
      // Optimistic update: remove from local list and refresh aggregate stats.
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      await fetchStats();
    },
    [fetchStats],
  );

  const reloadEntry = useCallback(
    (id: number): Promise<ExtractionResponse> => getHistoryDetail(id),
    [],
  );

  const refresh = useCallback(() => {
    fetchHistory(showAll);
    fetchStats();
  }, [fetchHistory, fetchStats, showAll]);

  return {
    historyState,
    entries,
    total,
    showAll,
    stats,
    statsLoading,
    toggleShowAll,
    deleteEntry,
    reloadEntry,
    refresh,
  };
}
