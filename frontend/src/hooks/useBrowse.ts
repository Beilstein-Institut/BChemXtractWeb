/**
 * useBrowse — pagination state, URL sync, API calls, and multi-select
 * for the StructureBrowser component.
 *
 * Mirrors useHistory.ts pattern: explicit state enum, useCallback for stable refs.
 * URL state: window.history.replaceState (not pushState) to avoid flooding history.
 */
import { useCallback, useEffect, useState } from "react";
import { getSubstancesPage } from "@/lib/apiClient";
import type { PagedSubstancesResponse } from "@/types/chemistry";

export type BrowseState = "idle" | "loading" | "success" | "error";
export type BrowseView = "grid" | "table";
export type BrowseSort = "extraction_order" | "formula";
export type BrowsePageSize = 12 | 24 | 48;

export interface UseBrowseReturn {
  browseState: BrowseState;
  page: PagedSubstancesResponse | null;
  view: BrowseView;
  sort: BrowseSort;
  pageSize: BrowsePageSize;
  currentPage: number;
  selectedIds: Set<number>;
  setView: (v: BrowseView) => void;
  setSort: (s: BrowseSort) => void;
  setPageSize: (n: BrowsePageSize) => void;
  goToPage: (n: number) => void;
  toggleSelect: (id: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
}

const PAGE_SIZES: readonly BrowsePageSize[] = [12, 24, 48];
const VIEWS: readonly BrowseView[] = ["grid", "table"];
const SORTS: readonly BrowseSort[] = ["extraction_order", "formula"];
const DEFAULT_PAGE_SIZE: BrowsePageSize = 12;

// Page size is the one durable, session-wide viewing PREFERENCE (items per
// page), so it's mirrored to sessionStorage. The URL query alone can't hold
// it: nav links are pathname-only (navigate("/browse")), so leaving Browse for
// History drops ?size=… and coming back would otherwise snap to the default.
// sessionStorage survives that round-trip for the tab's lifetime. Precedence:
// explicit URL param (shareable links win) > stored preference > default.
// (view and sort are deliberately NOT persisted — they reset on that
// round-trip; only items-per-page is treated as sticky.)
const SIZE_STORAGE_KEY = "bchemxtract:browse:size";

function readStoredSize(): BrowsePageSize | null {
  try {
    const raw = parseInt(sessionStorage.getItem(SIZE_STORAGE_KEY) ?? "", 10) as BrowsePageSize;
    return PAGE_SIZES.includes(raw) ? raw : null;
  } catch {
    // sessionStorage can throw (disabled / privacy mode) — fall back silently.
    return null;
  }
}

function writeStoredSize(size: BrowsePageSize): void {
  try {
    sessionStorage.setItem(SIZE_STORAGE_KEY, String(size));
  } catch {
    // Non-fatal: preference just won't persist this session.
  }
}

interface UrlParams {
  page: number;
  size: BrowsePageSize;
  view: BrowseView;
  sort: BrowseSort;
}

function readUrlParams(): UrlParams {
  const params = new URLSearchParams(window.location.search);
  const rawPage = parseInt(params.get("page") ?? "1", 10);
  const rawSize = parseInt(params.get("size") ?? "", 10) as BrowsePageSize;
  const rawView = params.get("view") as BrowseView | null;
  const rawSort = params.get("sort") as BrowseSort | null;

  // A valid URL size wins (shareable links); an absent or invalid one falls
  // back to the stored session preference, then the default. (An absent size
  // parses to NaN, which already fails the PAGE_SIZES check.)
  const size = PAGE_SIZES.includes(rawSize) ? rawSize : (readStoredSize() ?? DEFAULT_PAGE_SIZE);

  return {
    page: isNaN(rawPage) || rawPage < 1 ? 1 : rawPage,
    size,
    view: rawView && VIEWS.includes(rawView) ? rawView : "grid",
    sort: rawSort && SORTS.includes(rawSort) ? rawSort : "extraction_order",
  };
}

function writeUrlParams(
  extractionId: number | null | undefined,
  { page, size, view, sort }: UrlParams,
): void {
  const params = new URLSearchParams();
  if (extractionId) params.set("extraction", String(extractionId));
  params.set("page", String(page));
  params.set("size", String(size));
  params.set("view", view);
  params.set("sort", sort);
  window.history.replaceState(null, "", `?${params.toString()}`);
}

export function useBrowse(extractionId: number | null | undefined): UseBrowseReturn {
  const initial = readUrlParams();
  const [browseState, setBrowseState] = useState<BrowseState>("idle");
  const [page, setPage] = useState<PagedSubstancesResponse | null>(null);
  const [view, setViewState] = useState<BrowseView>(initial.view);
  const [sort, setSortState] = useState<BrowseSort>(initial.sort);
  const [pageSize, setPageSizeState] = useState<BrowsePageSize>(initial.size);
  const [currentPage, setCurrentPage] = useState<number>(initial.page);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const syncUrl = useCallback(
    (next: UrlParams) => writeUrlParams(extractionId, next),
    [extractionId],
  );

  const setView = useCallback(
    (v: BrowseView) => {
      setViewState(v);
      syncUrl({ page: currentPage, size: pageSize, view: v, sort });
    },
    [currentPage, pageSize, sort, syncUrl],
  );

  const setSort = useCallback(
    (s: BrowseSort) => {
      setSortState(s);
      setCurrentPage(1);
      syncUrl({ page: 1, size: pageSize, view, sort: s });
    },
    [pageSize, view, syncUrl],
  );

  const setPageSize = useCallback(
    (n: BrowsePageSize) => {
      setPageSizeState(n);
      setCurrentPage(1);
      // Persist the preference so it survives a pathname navigation
      // away and back (History → Browse) for the rest of the session.
      writeStoredSize(n);
      syncUrl({ page: 1, size: n, view, sort });
    },
    [view, sort, syncUrl],
  );

  const goToPage = useCallback(
    (n: number) => {
      setCurrentPage(n);
      syncUrl({ page: n, size: pageSize, view, sort });
    },
    [pageSize, view, sort, syncUrl],
  );

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  // Fetch when extractionId, currentPage, pageSize, or sort changes.
  // why: when extractionId goes null (navigating away from an active
  //      extraction) we reset the list to a known idle/null pair. The
  //      alternative — deriving browseState/page from extractionId at
  //      render time — would require lifting or duplicating the fetch
  //      state machine and still fire a render to flush the stale page.
  useEffect(() => {
    if (!extractionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset sync
      setBrowseState("idle");
      setPage(null);
      return;
    }
    let cancelled = false;
    setBrowseState("loading");
    getSubstancesPage(extractionId, currentPage, pageSize, sort)
      .then((data) => {
        if (cancelled) return;
        setPage(data);
        setBrowseState("success");
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
