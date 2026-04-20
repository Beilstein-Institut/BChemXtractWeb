/**
 * useSearch — URL-state + debounced fetch for the global search (Phase 9).
 *
 * Mirrors useBrowse.ts: guarded readUrlParams, replaceState (NOT pushState),
 * cancellation token on every fetch. Text-type queries debounce 300 ms per
 * D-03; substructure requires explicit submit() — the debounce effect
 * short-circuits when type === 'substructure'.
 *
 * URL-change propagation (Plan 07 integration):
 *   Every setter that calls `syncUrl(...)` ALSO dispatches a
 *   `window.CustomEvent('searchurlchange')` IMMEDIATELY AFTER the
 *   `replaceState` call. Plan 07's App.tsx listens for this event to
 *   re-check `?q=` presence and swap between SearchResults view and the
 *   prior view. (popstate does NOT fire on replaceState, hence the
 *   custom event.) This dispatch is ADDITIVE — it does not break
 *   useSearch's Wave-0 tests and does not change fetch semantics.
 *
 * URL schema: `?q=&type=&scope=&match=&page=`
 */
import { useEffect, useRef, useState, useCallback } from "react";
import type {
  SearchResponse,
  SearchType,
  SearchMatch,
} from "@/types/search";
import { postSearch } from "@/lib/apiClient";

export type SearchState = "idle" | "loading" | "success" | "error";

/** `global` or `extraction:{id}` — D-20 scope shape. */
export type SearchScope = string;

const DEBOUNCE_MS = 300;
const DEFAULT_SIZE = 24;

const VALID_TYPES: readonly SearchType[] = [
  "auto",
  "inchi_key",
  "formula",
  "smiles",
  "substructure",
];
const VALID_MATCH: readonly SearchMatch[] = ["canonical", "literal"];

export interface UseSearchReturn {
  searchState: SearchState;
  response: SearchResponse | null;
  query: string;
  type: SearchType;
  scope: SearchScope;
  match: SearchMatch;
  page: number;
  setQuery: (q: string) => void;
  setType: (t: SearchType) => void;
  setScope: (s: SearchScope) => void;
  setMatch: (m: SearchMatch) => void;
  goToPage: (n: number) => void;
  clear: () => void;
  submit: () => void;
}

// SEC MED-06 — caps on user-controlled URL parameters. Backend already
// enforces these (SearchRequest: query<=500, scope regex, page<=1000),
// but mirroring them here stops a malformed link from driving
// MAX_SAFE_INTEGER-sized pagination arithmetic in the UI.
const _MAX_PAGE = 10_000;
const _MAX_QUERY_LEN = 512;
const _SCOPE_RE = /^(?:global|extraction:\d+)$/;

function readUrlParams(): {
  q: string;
  type: SearchType;
  scope: SearchScope;
  match: SearchMatch;
  page: number;
} {
  const params = new URLSearchParams(window.location.search);
  const rawPage = parseInt(params.get("page") ?? "1", 10);
  const rawType = params.get("type") ?? "auto";
  const rawMatch = params.get("match") ?? "canonical";
  const rawScope = params.get("scope") ?? "global";
  const rawQuery = params.get("q") ?? "";
  return {
    q: rawQuery.slice(0, _MAX_QUERY_LEN),
    type: VALID_TYPES.includes(rawType as SearchType)
      ? (rawType as SearchType)
      : "auto",
    scope: _SCOPE_RE.test(rawScope) ? rawScope : "global",
    match: VALID_MATCH.includes(rawMatch as SearchMatch)
      ? (rawMatch as SearchMatch)
      : "canonical",
    page:
      isNaN(rawPage) || rawPage < 1
        ? 1
        : Math.min(rawPage, _MAX_PAGE),
  };
}

export function useSearch(): UseSearchReturn {
  const initial = readUrlParams();
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [query, setQueryState] = useState<string>(initial.q);
  const [type, setTypeState] = useState<SearchType>(initial.type);
  const [scope, setScopeState] = useState<SearchScope>(initial.scope);
  const [match, setMatchState] = useState<SearchMatch>(initial.match);
  const [page, setPageState] = useState<number>(initial.page);

  const debounceTimer = useRef<number | null>(null);

  // syncUrl: write state → URL via replaceState, then dispatch
  // 'searchurlchange' so Plan 07's App.tsx listener can detect the
  // URL transition (popstate does NOT fire on replaceState).
  const syncUrl = useCallback(
    (
      q: string,
      t: SearchType,
      s: SearchScope,
      m: SearchMatch,
      p: number
    ) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (t !== "auto") params.set("type", t);
      if (s !== "global") params.set("scope", s);
      if (m !== "canonical") params.set("match", m);
      if (p > 1) params.set("page", String(p));
      const qs = params.toString();
      const url = qs ? `?${qs}` : window.location.pathname;
      window.history.replaceState(null, "", url);
      // Plan 07 integration — App.tsx listens for this to swap views.
      window.dispatchEvent(new CustomEvent("searchurlchange"));
    },
    []
  );

  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q);
      setPageState(1);
      syncUrl(q, type, scope, match, 1);
    },
    [type, scope, match, syncUrl]
  );
  const setType = useCallback(
    (t: SearchType) => {
      setTypeState(t);
      setPageState(1);
      syncUrl(query, t, scope, match, 1);
    },
    [query, scope, match, syncUrl]
  );
  const setScope = useCallback(
    (s: SearchScope) => {
      setScopeState(s);
      setPageState(1);
      syncUrl(query, type, s, match, 1);
    },
    [query, type, match, syncUrl]
  );
  const setMatch = useCallback(
    (m: SearchMatch) => {
      setMatchState(m);
      setPageState(1);
      syncUrl(query, type, scope, m, 1);
    },
    [query, type, scope, syncUrl]
  );
  const goToPage = useCallback(
    (n: number) => {
      setPageState(n);
      syncUrl(query, type, scope, match, n);
    },
    [query, type, scope, match, syncUrl]
  );
  const clear = useCallback(() => {
    setQueryState("");
    setTypeState("auto");
    setScopeState("global");
    setMatchState("canonical");
    setPageState(1);
    setResponse(null);
    setSearchState("idle");
    window.history.replaceState(null, "", window.location.pathname);
    // Plan 07 integration — fire 'searchurlchange' on clear() too so
    // App.tsx falls back from SearchResults view to the prior view.
    window.dispatchEvent(new CustomEvent("searchurlchange"));
  }, []);

  // Fire a fetch — used by both the debounced effect and explicit submit.
  const runFetch = useCallback(
    (cancelled: { v: boolean }) => {
      if (!query) return;
      setSearchState("loading");
      postSearch({
        query,
        type,
        scope,
        match,
        page,
        size: DEFAULT_SIZE,
      })
        .then((r) => {
          if (!cancelled.v) {
            setResponse(r);
            setSearchState("success");
          }
        })
        .catch(() => {
          if (!cancelled.v) setSearchState("error");
        });
    },
    [query, type, scope, match, page]
  );

  // Debounced live fetch for text-based types (D-03).
  useEffect(() => {
    if (!query) {
      setSearchState("idle");
      setResponse(null);
      return;
    }
    if (type === "substructure") {
      // Explicit submit only for substructure (D-03).
      return;
    }
    const cancelled = { v: false };
    if (debounceTimer.current !== null)
      window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(
      () => runFetch(cancelled),
      DEBOUNCE_MS
    );
    return () => {
      cancelled.v = true;
      if (debounceTimer.current !== null)
        window.clearTimeout(debounceTimer.current);
    };
  }, [query, type, scope, match, page, runFetch]);

  const submit = useCallback(() => {
    if (!query) return;
    const cancelled = { v: false };
    runFetch(cancelled);
  }, [query, runFetch]);

  return {
    searchState,
    response,
    query,
    type,
    scope,
    match,
    page,
    setQuery,
    setType,
    setScope,
    setMatch,
    goToPage,
    clear,
    submit,
  };
}
