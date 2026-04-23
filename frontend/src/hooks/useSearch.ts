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
import { useCallback, useEffect, useRef, useState } from "react";
import { postSearch } from "@/lib/apiClient";
import type {
  SearchMatch,
  SearchResponse,
  SearchType,
} from "@/types/search";

export type SearchState = "idle" | "loading" | "success" | "error";

/** `global` or `extraction:{id}` — D-20 scope shape. */
export type SearchScope = string;

const DEBOUNCE_MS = 300;
const DEFAULT_SIZE = 24;
const SEARCH_URL_EVENT = "searchurlchange";

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
const MAX_PAGE = 10_000;
const MAX_QUERY_LEN = 512;
const SCOPE_RE = /^(?:global|extraction:\d+)$/;

interface SearchParams {
  q: string;
  type: SearchType;
  scope: SearchScope;
  match: SearchMatch;
  page: number;
}

function readUrlParams(): SearchParams {
  const params = new URLSearchParams(window.location.search);
  const rawPage = parseInt(params.get("page") ?? "1", 10);
  const rawType = params.get("type") ?? "auto";
  const rawMatch = params.get("match") ?? "canonical";
  const rawScope = params.get("scope") ?? "global";
  const rawQuery = params.get("q") ?? "";
  return {
    q: rawQuery.slice(0, MAX_QUERY_LEN),
    type: VALID_TYPES.includes(rawType as SearchType)
      ? (rawType as SearchType)
      : "auto",
    scope: SCOPE_RE.test(rawScope) ? rawScope : "global",
    match: VALID_MATCH.includes(rawMatch as SearchMatch)
      ? (rawMatch as SearchMatch)
      : "canonical",
    page: isNaN(rawPage) || rawPage < 1 ? 1 : Math.min(rawPage, MAX_PAGE),
  };
}

/**
 * Write state → URL via replaceState, then dispatch 'searchurlchange'
 * so Plan 07's App.tsx listener can detect the URL transition
 * (popstate does NOT fire on replaceState).
 */
function writeUrlParams({ q, type, scope, match, page }: SearchParams): void {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (type !== "auto") params.set("type", type);
  if (scope !== "global") params.set("scope", scope);
  if (match !== "canonical") params.set("match", match);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  const url = qs ? `?${qs}` : window.location.pathname;
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new CustomEvent(SEARCH_URL_EVENT));
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

  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q);
      setPageState(1);
      writeUrlParams({ q, type, scope, match, page: 1 });
    },
    [type, scope, match],
  );
  const setType = useCallback(
    (t: SearchType) => {
      setTypeState(t);
      setPageState(1);
      writeUrlParams({ q: query, type: t, scope, match, page: 1 });
    },
    [query, scope, match],
  );
  const setScope = useCallback(
    (s: SearchScope) => {
      setScopeState(s);
      setPageState(1);
      writeUrlParams({ q: query, type, scope: s, match, page: 1 });
    },
    [query, type, match],
  );
  const setMatch = useCallback(
    (m: SearchMatch) => {
      setMatchState(m);
      setPageState(1);
      writeUrlParams({ q: query, type, scope, match: m, page: 1 });
    },
    [query, type, scope],
  );
  const goToPage = useCallback(
    (n: number) => {
      setPageState(n);
      writeUrlParams({ q: query, type, scope, match, page: n });
    },
    [query, type, scope, match],
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
    // Plan 07 integration — let App.tsx fall back from SearchResults view.
    window.dispatchEvent(new CustomEvent(SEARCH_URL_EVENT));
  }, []);

  // Fire a fetch — used by both the debounced effect and explicit submit().
  // Returns a guard so callers (e.g. the debounced effect) can drop stale
  // results when a subsequent keystroke supersedes this run.
  const runFetch = useCallback(() => {
    if (!query) return { cancel: () => {} };
    const cancelled = { v: false };
    setSearchState("loading");
    postSearch({ query, type, scope, match, page, size: DEFAULT_SIZE })
      .then((r) => {
        if (cancelled.v) return;
        setResponse(r);
        setSearchState("success");
      })
      .catch(() => {
        if (!cancelled.v) setSearchState("error");
      });
    return {
      cancel: () => {
        cancelled.v = true;
      },
    };
  }, [query, type, scope, match, page]);

  // Debounced live fetch for text-based types (D-03). Substructure
  // requires an explicit submit() call and short-circuits here.
  // why: when the query string clears we reset to idle + null response.
  //      That's a sync of input-driven state, not a render-derived update.
  useEffect(() => {
    if (!query) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset sync
      setSearchState("idle");
      setResponse(null);
      return;
    }
    if (type === "substructure") return;

    let handle: { cancel: () => void } | null = null;
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = window.setTimeout(() => {
      handle = runFetch();
    }, DEBOUNCE_MS);

    return () => {
      handle?.cancel();
      if (debounceTimer.current !== null) {
        window.clearTimeout(debounceTimer.current);
      }
    };
  }, [query, type, scope, match, page, runFetch]);

  const submit = useCallback(() => {
    runFetch();
  }, [runFetch]);

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
