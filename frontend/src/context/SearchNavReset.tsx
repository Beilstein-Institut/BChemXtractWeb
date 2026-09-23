import { useEffect } from "react";

import { useSearch } from "@/context/SearchContext";
import { ROUTE_CHANGE_EVENT } from "@/lib/router";

/**
 * Search lives on the Browse and History pages only, so a query must not
 * follow the user to another page: clear it on in-app navigation (the router's
 * ROUTE_CHANGE_EVENT, fired by navigate()). Browser Back/Forward fire popstate
 * instead, and the search hook re-reads the query from that history entry, so
 * going back to a search restores it. Render once inside SearchProvider.
 */
export function SearchNavReset() {
  const { query, clear } = useSearch();
  useEffect(() => {
    if (!query) return;
    window.addEventListener(ROUTE_CHANGE_EVENT, clear);
    return () => window.removeEventListener(ROUTE_CHANGE_EVENT, clear);
  }, [query, clear]);
  return null;
}
