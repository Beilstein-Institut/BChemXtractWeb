import { Suspense, lazy } from "react";

import type { SearchResultsProps } from "@/components/SearchResults";

// Search results (grid, pagination, did-you-mean) only render once a query is
// typed on Browse or History, so they stay out of the initial bundle.
const SearchResults = lazy(() =>
  import("@/components/SearchResults").then((m) => ({ default: m.SearchResults })),
);

/** SearchResults, loaded on first use. Renders nothing while the chunk loads. */
export function LazySearchResults(props: SearchResultsProps) {
  return (
    <Suspense fallback={null}>
      <SearchResults {...props} />
    </Suspense>
  );
}
