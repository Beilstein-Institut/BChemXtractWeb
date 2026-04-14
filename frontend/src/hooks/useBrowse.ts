/**
 * useBrowse — pagination state, URL sync, API calls, and multi-select
 * for the StructureBrowser component (Phase 6, D-01, D-15).
 *
 * Mirrors useHistory.ts pattern: explicit state enum, useCallback for stable refs.
 * URL state: window.history.replaceState (not pushState) to avoid flooding history.
 */
import { useState, useCallback, useEffect } from "react";
import type { PagedSubstancesResponse } from "@/types/chemistry";
import { getSubstancesPage } from "@/lib/apiClient";

export type BrowseState = "idle" | "loading" | "success" | "error";
export type BrowseView = "grid" | "table";
export type BrowseSort = "extraction_order" | "formula";

export interface UseBrowseReturn {
  browseState: BrowseState;
  page: PagedSubstancesResponse | null;
  view: BrowseView;
  sort: BrowseSort;
  pageSize: 12 | 24 | 48;
  currentPage: number;
  selectedIds: Set<number>;
  setView: (v: BrowseView) => void;
  setSort: (s: BrowseSort) => void;
  setPageSize: (n: 12 | 24 | 48) => void;
  goToPage: (n: number) => void;
  toggleSelect: (id: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
}

function readUrlParams(): {
  page: number;
  size: 12 | 24 | 48;
  view: BrowseView;
  sort: BrowseSort;
} {
  const params = new URLSearchParams(window.location.search);
  const rawPage = parseInt(params.get("page") ?? "1", 10);
  const rawSize = parseInt(params.get("size") ?? "12", 10);
  const rawView = params.get("view") ?? "grid";
  const rawSort = params.get("sort") ?? "extraction_order";

  return {
    page: isNaN(rawPage) || rawPage < 1 ? 1 : rawPage,
    size: ([12, 24, 48] as const).includes(rawSize as 12 | 24 | 48)
      ? (rawSize as 12 | 24 | 48)
      : 12,
    view: (["grid", "table"] as const).includes(rawView as BrowseView)
      ? (rawView as BrowseView)
      : "grid",
    sort: (["extraction_order", "formula"] as const).includes(rawSort as BrowseSort)
      ? (rawSort as BrowseSort)
      : "extraction_order",
  };
}

export function useBrowse(extractionId: number | null | undefined): UseBrowseReturn {
  const initial = readUrlParams();
  const [browseState, setBrowseState] = useState<BrowseState>("idle");
  const [page, setPage] = useState<PagedSubstancesResponse | null>(null);
  const [view, setViewState] = useState<BrowseView>(initial.view);
  const [sort, setSortState] = useState<BrowseSort>(initial.sort);
  const [pageSize, setPageSizeState] = useState<12 | 24 | 48>(initial.size);
  const [currentPage, setCurrentPage] = useState<number>(initial.page);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Sync URL search params on state change (D-15)
  const syncUrl = useCallback(
    (
      eid: number | null | undefined,
      pg: number,
      sz: number,
      vw: BrowseView,
      sr: BrowseSort
    ) => {
      const params = new URLSearchParams();
      if (eid) params.set("extraction", String(eid));
      params.set("page", String(pg));
      params.set("size", String(sz));
      params.set("view", vw);
      params.set("sort", sr);
      window.history.replaceState(null, "", `?${params.toString()}`);
    },
    []
  );

  const setView = useCallback(
    (v: BrowseView) => {
      setViewState(v);
      syncUrl(extractionId, currentPage, pageSize, v, sort);
    },
    [extractionId, currentPage, pageSize, sort, syncUrl]
  );

  const setSort = useCallback(
    (s: BrowseSort) => {
      setSortState(s);
      setCurrentPage(1);
      syncUrl(extractionId, 1, pageSize, view, s);
    },
    [extractionId, pageSize, view, syncUrl]
  );

  const setPageSize = useCallback(
    (n: 12 | 24 | 48) => {
      setPageSizeState(n);
      setCurrentPage(1);
      syncUrl(extractionId, 1, n, view, sort);
    },
    [extractionId, view, sort, syncUrl]
  );

  const goToPage = useCallback(
    (n: number) => {
      setCurrentPage(n);
      syncUrl(extractionId, n, pageSize, view, sort);
    },
    [extractionId, pageSize, view, sort, syncUrl]
  );

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!page) return;
    setSelectedIds(new Set(page.items.map((s) => s.id)));
  }, [page]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Fetch when extractionId, currentPage, pageSize, or sort changes
  useEffect(() => {
    if (!extractionId) {
      setBrowseState("idle");
      setPage(null);
      return;
    }
    let cancelled = false;
    setBrowseState("loading");
    getSubstancesPage(extractionId, currentPage, pageSize, sort)
      .then((data) => {
        if (!cancelled) {
          setPage(data);
          setBrowseState("success");
        }
      })
      .catch(() => {
        if (!cancelled) setBrowseState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [extractionId, currentPage, pageSize, sort]);

  return {
    browseState,
    page,
    view,
    sort,
    pageSize,
    currentPage,
    selectedIds,
    setView,
    setSort,
    setPageSize,
    goToPage,
    toggleSelect,
    selectAll,
    clearSelection,
  };
}
