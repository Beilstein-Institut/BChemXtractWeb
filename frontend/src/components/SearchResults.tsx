/**
 * SearchResults — main content area when a search query is active (D-11).
 *
 * Layout per UI-SPEC §2:
 *   - metadata row: "{N} results for `{query}` · {type} · {scope}"
 *     with "Clear search" ghost button on the right
 *   - 4-col responsive grid of SearchResultCard (or 6-skeleton grid while loading)
 *   - EmptyState with DidYouMean on 0 results
 *   - EmptyState with retry on network error
 *   - Pagination below grid
 *
 * Backend warnings (D-09) surface as a sonner toast, deduplicated via
 * a ref so a single warning doesn't fire twice if `response` re-renders.
 *
 * Consumes the `useSearch` hook (Plan 06). Plan 07 does NOT modify
 * useSearch.ts — this component is a pure reader.
 */
import { useEffect, useRef } from "react";
import { AlertCircleIcon, SearchXIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { DidYouMean } from "@/components/DidYouMean";
import { SearchResultCard } from "@/components/SearchResultCard";
import { useSearch } from "@/context/SearchContext";
import type { SearchType } from "@/types/search";

const PAGE_SIZE = 24;

const TYPE_LABEL: Record<SearchType, string> = {
  auto: "Auto",
  inchi_key: "InChI key",
  formula: "Formula",
  smiles: "SMILES",
  substructure: "Substructure",
};

/**
 * Build a trimmed page-number list for the pagination bar.
 * Shows first 2, last 2, current, and neighbors. Up to ~7 numbers.
 */
function buildPageNumbers(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, 2, total - 1, total, current]);
  for (let d = -1; d <= 1; d++) {
    const n = current + d;
    if (n > 0 && n <= total) pages.add(n);
  }
  return Array.from(pages).sort((a, b) => a - b);
}

export function SearchResults() {
  const {
    searchState,
    response,
    query,
    type,
    scope,
    page,
    setQuery,
    setType,
    goToPage,
    clear,
    submit,
  } = useSearch();

  // Surface backend warnings as a sonner toast (D-09). Dedup by the first
  // warning string so a single warning doesn't re-fire on re-renders.
  const lastToastRef = useRef<string | null>(null);
  useEffect(() => {
    if (!response || !response.warnings?.length) return;
    const msg = response.warnings[0];
    if (lastToastRef.current === msg) return;
    lastToastRef.current = msg;
    toast.warning(msg, { duration: 5000 });
  }, [response]);

  // useSearch state is per-consumer (no Context/store), so SearchInput's
  // submit() on Enter populates its OWN `response`, not ours. For every
  // non-substructure type the debounced useEffect inside useSearch also
  // runs here and converges us to the same data — but for substructure
  // the debounce bails (D-03, useSearch.ts) and we'd stay stuck at
  // response === null. Fire our own submit() whenever the URL carries a
  // live substructure query so the grid + warning toast render.
  useEffect(() => {
    if (type !== "substructure") return;
    if (!query) return;
    submit();
  }, [query, type, scope, page, submit]);

  const total = response?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const scopeLabel = scope?.startsWith("extraction:") ? "In this extraction" : "All extractions";

  const metadataRow = (
    <div className="flex items-center justify-between h-9">
      <div className="text-caption text-muted-foreground">
        <span>{total}</span> <span>{total === 1 ? "result" : "results"} for </span>
        <code className="font-mono text-foreground">{query}</code>
        <span> · {TYPE_LABEL[type]}</span>
        <span> · {scopeLabel}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={() => clear()}>
        Clear search
      </Button>
    </div>
  );

  // DidYouMean only supports non-"auto" search types; coerce "auto" to
  // the "smiles" default the empty-state chip was written for.
  const didYouMeanType: Exclude<SearchType, "auto"> = type === "auto" ? "smiles" : type;

  return (
    <section
      className="max-w-[1280px] mx-auto px-6 py-8"
      aria-busy={searchState === "loading" ? "true" : "false"}
    >
      <h2 className="sr-only">Search results</h2>

      {metadataRow}
      <Separator className="my-4" />

      {searchState === "loading" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      )}

      {searchState === "error" && (
        <EmptyState
          icon={AlertCircleIcon}
          title="Search didn't work"
          message="Something went wrong. Try again in a moment."
          size="large"
          action={
            <Button variant="outline" onClick={() => submit()}>
              Retry
            </Button>
          }
        />
      )}

      {searchState === "success" && response && response.results.length === 0 && (
        <EmptyState
          icon={SearchXIcon}
          title={`No matches for ${query}`}
          message="Try a different spelling, a simpler formula, or a different search type."
          size="large"
          action={
            <DidYouMean
              type={didYouMeanType}
              query={query}
              onSuggest={(upd) => {
                if (upd.type) setType(upd.type);
                if (upd.query !== undefined) setQuery(upd.query);
              }}
            />
          }
        />
      )}

      {searchState === "success" && response && response.results.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
            {response.results.map((r) => (
              <SearchResultCard key={r.substance.id} result={r} searchType={type} />
            ))}
          </div>

          {totalPages > 1 && (
            <Pagination className="mt-8">
              <PaginationContent>
                {page > 1 && (
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={(e) => {
                        e.preventDefault();
                        goToPage(page - 1);
                      }}
                      href="#"
                    />
                  </PaginationItem>
                )}
                {buildPageNumbers(page, totalPages).map((n) => (
                  <PaginationItem key={n}>
                    <PaginationLink
                      isActive={n === page}
                      onClick={(e) => {
                        e.preventDefault();
                        goToPage(n);
                      }}
                      href="#"
                    >
                      {n}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                {page < totalPages && (
                  <PaginationItem>
                    <PaginationNext
                      onClick={(e) => {
                        e.preventDefault();
                        goToPage(page + 1);
                      }}
                      href="#"
                    />
                  </PaginationItem>
                )}
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}
    </section>
  );
}
