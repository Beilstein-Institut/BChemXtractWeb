import { useEffect, useState } from "react";

import { SearchInput } from "@/components/SearchInput";
import { PillToggle } from "@/components/ui/pill-toggle";
import { useSearch } from "@/context/SearchContext";

type Reach = "extraction" | "all";

interface BrowseSearchProps {
  /** Extraction being browsed; null when none is loaded (search is then global). */
  extractionId: number | null;
}

/**
 * Structure search bar for the Browse page. Searches the extraction being
 * browsed by default; the toggle widens it to every extraction. With no
 * extraction loaded there is nothing narrower to search, so it is global.
 */
export function BrowseSearch({ extractionId }: BrowseSearchProps) {
  const { query, scope: activeScope, setScope } = useSearch();
  // A deep link that already searches everything (?scope=global) keeps that.
  const [reach, setReach] = useState<Reach>(() =>
    query && activeScope === "global" ? "all" : "extraction",
  );

  const canNarrow = extractionId !== null;
  const scope = canNarrow && reach === "extraction" ? `extraction:${extractionId}` : "global";

  // Keep an active search pointed at this box's scope: re-runs it when the
  // toggle flips, and when the browsed extraction changes underneath it (e.g.
  // "Back to latest"), so results never come from the previous extraction.
  // An empty box needs nothing: typing passes the scope with the query.
  useEffect(() => {
    if (query && activeScope !== scope) setScope(scope);
  }, [query, activeScope, scope, setScope]);

  return (
    <div data-slot="browse-search" className="flex flex-wrap items-center gap-3">
      <SearchInput
        scope={scope}
        ariaLabel={
          scope === "global"
            ? "Search structures across all extractions"
            : "Search structures in this extraction"
        }
        className="min-w-[16rem] flex-1"
      />
      {canNarrow && (
        <PillToggle
          value={reach}
          onChange={setReach}
          aria-label="Search scope"
          options={[
            { value: "extraction", label: "This extraction" },
            { value: "all", label: "All extractions" },
          ]}
        />
      )}
    </div>
  );
}
