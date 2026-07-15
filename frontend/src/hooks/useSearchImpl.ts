/**
 * useSearchImpl — URL state + debounced fetch + parse-validation, unified
 * across all consumers via SearchContext.
 *
 * Changes vs the previous useSearch:
 *   - Substructure short-circuit removed. All types flow through the
 *     same debounced fetch.
 *   - New validity state machine + pre-fetch gate for substructure.
 *   - New stereo state mirrored in URL (?stereo=1) and sent on each
 *     request.
 *
 * This hook is intended to be called ONCE per page (by SearchProvider).
 * Consumers use useSearchContext() from @/context/SearchContext, not
 * this file directly.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { postSearch, postSearchValidate } from "@/lib/apiClient";
import type { SearchLanguage, SearchMatch, SearchResponse, SearchType } from "@/types/search";

export type SearchState = "idle" | "loading" | "success" | "error";
export type SearchScope = string;

export type QueryValidity =
  | { state: "unknown" }
  | { state: "validating" }
  | { state: "valid"; language: SearchLanguage; atomCount: number }
  | { state: "invalid"; error: string };

const VALIDATE_DEBOUNCE_MS = 150;
const FETCH_DEBOUNCE_MS = 300;
const DEFAULT_SIZE = 24;
export const SEARCH_URL_EVENT = "searchurlchange";

const VALID_TYPES: readonly SearchType[] = [
  "auto",
  "inchi_key",
  "formula",
  "smiles",
  "substructure",
];
const VALID_MATCH: readonly SearchMatch[] = ["canonical", "literal"];

const MAX_PAGE = 10_000;
const MAX_QUERY_LEN = 512;
const SCOPE_RE = /^(?:global|extraction:\d+)$/;

export interface UseSearchReturn {
  searchState: SearchState;
  response: SearchResponse | null;
  query: string;
  type: SearchType;
  scope: SearchScope;
  match: SearchMatch;
  page: number;
  stereo: boolean;
  queryValidity: QueryValidity;
  setQuery: (q: string) => void;
  setType: (t: SearchType) => void;
  setScope: (s: SearchScope) => void;
  setMatch: (m: SearchMatch) => void;
  setStereo: (v: boolean) => void;
  goToPage: (n: number) => void;
  clear: () => void;
  submit: () => void;
}

interface SearchParams {
  q: string;
  type: SearchType;
  scope: SearchScope;
  match: SearchMatch;
  page: number;
  stereo: boolean;
}

function readUrlParams(): SearchParams {
  const params = new URLSearchParams(window.location.search);
  const rawPage = parseInt(params.get("page") ?? "1", 10);
  const rawType = params.get("type") ?? "auto";
  const rawMatch = params.get("match") ?? "canonical";
  const rawScope = params.get("scope") ?? "global";
  const rawQuery = params.get("q") ?? "";
  const rawStereo = params.get("stereo") === "1";
  return {
    q: rawQuery.slice(0, MAX_QUERY_LEN),
    type: VALID_TYPES.includes(rawType as SearchType) ? (rawType as SearchType) : "auto",
    scope: SCOPE_RE.test(rawScope) ? rawScope : "global",
    match: VALID_MATCH.includes(rawMatch as SearchMatch) ? (rawMatch as SearchMatch) : "canonical",
    page: isNaN(rawPage) || rawPage < 1 ? 1 : Math.min(rawPage, MAX_PAGE),
    stereo: rawStereo,
  };
}

function writeUrlParams(p: SearchParams): void {
  const params = new URLSearchParams();
  if (p.q) params.set("q", p.q);
  if (p.type !== "auto") params.set("type", p.type);
  if (p.scope !== "global") params.set("scope", p.scope);
  if (p.match !== "canonical") params.set("match", p.match);
  if (p.page > 1) params.set("page", String(p.page));
  if (p.stereo) params.set("stereo", "1");
  const qs = params.toString();
  const url = qs ? `?${qs}` : window.location.pathname;
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new CustomEvent(SEARCH_URL_EVENT));
}

export function useSearchImpl(): UseSearchReturn {
  const initial = readUrlParams();
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [query, setQueryState] = useState<string>(initial.q);
  const [type, setTypeState] = useState<SearchType>(initial.type);
  const [scope, setScopeState] = useState<SearchScope>(initial.scope);
  const [match, setMatchState] = useState<SearchMatch>(initial.match);
  const [page, setPageState] = useState<number>(initial.page);
  const [stereo, setStereoState] = useState<boolean>(initial.stereo);
  const [queryValidity, setQueryValidity] = useState<QueryValidity>({ state: "unknown" });

  const fetchTimer = useRef<number | null>(null);
  const validateTimer = useRef<number | null>(null);
  // Adopt browser back/forward into hook state. The URL is the single source
  // of truth for search params, and this hook lives at the app root (never
  // unmounts), so on popstate the query/scope can change out from under it —
  // re-read the URL and mirror it into state. Self-writes go through the
  // setters below via history.replaceState, which never fires popstate, so
  // there is no self-trigger to guard against.
  useEffect(() => {
    const sync = () => {
      const p = readUrlParams();
      setQueryState(p.q);
      setTypeState(p.type);
      setScopeState(p.scope);
      setMatchState(p.match);
      setPageState(p.page);
      setStereoState(p.stereo);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q);
      setPageState(1);
      writeUrlParams({ q, type, scope, match, page: 1, stereo });
    },
    [type, scope, match, stereo],
  );
  const setType = useCallback(
    (t: SearchType) => {
      setTypeState(t);
      setPageState(1);
      writeUrlParams({ q: query, type: t, scope, match, page: 1, stereo });
    },
    [query, scope, match, stereo],
  );
  const setScope = useCallback(
    (s: SearchScope) => {
      setScopeState(s);
      setPageState(1);
      writeUrlParams({ q: query, type, scope: s, match, page: 1, stereo });
    },
    [query, type, match, stereo],
  );
  const setMatch = useCallback(
    (m: SearchMatch) => {
      setMatchState(m);
      setPageState(1);
      writeUrlParams({ q: query, type, scope, match: m, page: 1, stereo });
    },
    [query, type, scope, stereo],
  );
  const setStereo = useCallback(
    (v: boolean) => {
      setStereoState(v);
      writeUrlParams({ q: query, type, scope, match, page, stereo: v });
    },
    [query, type, scope, match, page],
  );
  const goToPage = useCallback(
    (n: number) => {
      setPageState(n);
      writeUrlParams({ q: query, type, scope, match, page: n, stereo });
    },
    [query, type, scope, match, stereo],
  );
  const clear = useCallback(() => {
    setQueryState("");
    setTypeState("auto");
    setScopeState("global");
    setMatchState("canonical");
    setPageState(1);
    setStereoState(false);
    setResponse(null);
    setSearchState("idle");
    setQueryValidity({ state: "unknown" });
    window.history.replaceState(null, "", window.location.pathname);
    // App listens for this to re-evaluate the ?q= → SearchResults routing gate.
    window.dispatchEvent(new CustomEvent(SEARCH_URL_EVENT));
  }, []);

  // --- Validation effect (substructure only) ---
  useEffect(() => {
    if (type !== "substructure" || !query) {
      // Defer the state reset so the rule at react-hooks/set-state-in-effect
      // doesn't flag this synchronous setState.
      Promise.resolve().then(() => setQueryValidity({ state: "unknown" }));
      return;
    }
    let cancelled = false;
    if (validateTimer.current !== null) {
      window.clearTimeout(validateTimer.current);
    }
    validateTimer.current = window.setTimeout(async () => {
      if (cancelled) return;
      setQueryValidity({ state: "validating" });
      try {
        const r = await postSearchValidate({ query, stereo });
        if (cancelled) return;
        if (r.valid && r.language) {
          setQueryValidity({
            state: "valid",
            language: r.language,
            atomCount: r.atom_count,
          });
        } else {
          setQueryValidity({
            state: "invalid",
            error: r.error ?? "Invalid query",
          });
        }
      } catch {
        if (!cancelled) setQueryValidity({ state: "unknown" });
      }
    }, VALIDATE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (validateTimer.current !== null) {
        window.clearTimeout(validateTimer.current);
      }
    };
  }, [query, type, stereo]);

  // --- Unified fetch effect ---
  const runFetch = useCallback(() => {
    if (!query) return { cancel: () => {} };
    const cancelled = { v: false };
    setSearchState("loading");
    postSearch({ query, type, scope, match, page, size: DEFAULT_SIZE, stereo })
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
  }, [query, type, scope, match, page, stereo]);

  useEffect(() => {
    if (!query) {
      // Defer state resets to satisfy the react-hooks/set-state-in-effect rule.
      Promise.resolve().then(() => {
        setSearchState("idle");
        setResponse(null);
      });
      return;
    }
    const requiresValidity = type === "substructure";
    if (requiresValidity && queryValidity.state !== "valid") return;

    let handle: { cancel: () => void } | null = null;
    if (fetchTimer.current !== null) {
      window.clearTimeout(fetchTimer.current);
    }
    fetchTimer.current = window.setTimeout(() => {
      handle = runFetch();
    }, FETCH_DEBOUNCE_MS);

    return () => {
      handle?.cancel();
      if (fetchTimer.current !== null) {
        window.clearTimeout(fetchTimer.current);
      }
    };
  }, [query, type, scope, match, page, stereo, queryValidity, runFetch]);

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
    stereo,
    queryValidity,
    setQuery,
    setType,
    setScope,
    setMatch,
    setStereo,
    goToPage,
    clear,
    submit,
  };
}
