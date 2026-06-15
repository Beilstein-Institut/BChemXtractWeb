/**
 * SearchContext — single source of truth for search state across
 * SearchInput, SearchResults, and any other consumer.
 *
 * Without this, SearchInput and SearchResults each called useSearch()
 * separately and owned de-synced state, so typing in the input never
 * updated the already-mounted results (the "stuck search" bug). A single
 * shared instance keeps every consumer reading the same query state.
 *
 * Wrap the route tree in <SearchProvider> once (done in App.tsx), then
 * read state via useSearch() from this file — NOT from
 * @/hooks/useSearchImpl directly.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useSearchImpl, type UseSearchReturn } from "@/hooks/useSearchImpl";

const SearchContext = createContext<UseSearchReturn | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const state = useSearchImpl();
  return <SearchContext.Provider value={state}>{children}</SearchContext.Provider>;
}

/** Read shared search state. Must be called inside a SearchProvider. */
// eslint-disable-next-line react-refresh/only-export-components
export function useSearch(): UseSearchReturn {
  const ctx = useContext(SearchContext);
  if (ctx === null) {
    throw new Error("useSearch must be used within <SearchProvider>");
  }
  return ctx;
}
