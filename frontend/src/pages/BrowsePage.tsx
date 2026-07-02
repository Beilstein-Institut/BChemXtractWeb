/**
 * BrowsePage — bento landing + extraction tabs (route: `/browse`).
 *
 * The page is scoped to whichever extraction is "active" (set by
 * App.tsx after a successful upload or via `handleViewExtraction`).
 * Landing layout, top-down:
 *
 *   1. Page header (display title + sub-copy).
 *   2. `SearchFilter` composite (debounced 250 ms query + 3 chips).
 *   3. `BrowseBento` — a compact extraction receipt (filename, dedup, InChI
 *      usability, PubChem matches when enabled, reactions when present).
 *      Describes the whole extraction, not the filtered view. Export lives
 *      in the StructureBrowser toolbar below, so it is not duplicated here.
 *   4. `ExtractionTabs` wrapping `StructureBrowser` (full paginated
 *      grid/table view + Reactions tab).
 *
 * The StructureBrowser below keeps its paginated server-driven contract
 * (`useBrowse` unchanged); the `filters` prop reaches it so the grid
 * honours the same chip + query state on the current page slice
 * (client-side predicate — server pagination is unmodified).
 */
import { useMemo, useState } from "react";
import { FileUpIcon, HistoryIcon } from "lucide-react";
import { BrowseBento } from "@/components/browse/BrowseBento";
import { ExtractionTabs } from "@/components/ExtractionTabs";
import { PageContainer } from "@/components/layout/PageContainer";
import { SearchFilter } from "@/components/SearchFilter";
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  type BrowseFilters,
} from "@/components/browse/browseFilters";
import { filterSubstances } from "@/components/browse/filterSubstances";
import { StructureBrowser } from "@/components/StructureBrowser";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DEFAULT_DEPICTION } from "@/lib/depiction";
import { Link } from "@/lib/Link";
import { isRealInchiKey } from "@/lib/inchi";
import { formulaHasMetal } from "@/lib/elements";
import { usePubChemEnrichment } from "@/hooks/usePubChemEnrichment";
import { usePubChemPreferences } from "@/hooks/usePubChemPreferences";
import type { Depiction, ExtractionResponse, ReactionExtractionResponse } from "@/types/chemistry";

export interface BrowsePageProps {
  activeExtractionId: number | null;
  activeResult: ExtractionResponse | null;
  isHistoricalView: boolean;
  selectedFile: File | null;
  cachedReactionsData: ReactionExtractionResponse | null;
  liveReactionCount: number;
  onReset: () => void;
  onBackToLatest: () => void;
  onSearchWithin: () => void;
  onReactionsCountChange: (count: number) => void;
}

export function BrowsePage({
  activeExtractionId,
  activeResult,
  isHistoricalView,
  selectedFile,
  cachedReactionsData,
  liveReactionCount,
  onReset,
  onBackToLatest,
  onSearchWithin,
  onReactionsCountChange,
}: BrowsePageProps) {
  const hasExtraction = activeExtractionId !== null && activeResult !== null;

  const [filters, setFilters] = useState<BrowseFilters>({ ...EMPTY_FILTERS });
  // Page-wide 2D layout: CDK (canonical layout) by default, ChemDraw via
  // the toolbar toggle. Drives every structure render on this page plus
  // the depiction sent with image exports. Deliberately NOT persisted —
  // the product default is CDK on every visit.
  const [depiction, setDepiction] = useState<Depiction>(DEFAULT_DEPICTION);

  // Reactions are known eagerly only for a persisted extraction (App
  // prefetches them). For a fresh upload the count stays unknown until the
  // Reactions tab runs. The receipt only surfaces reactions when there is a
  // positive count, so undefined/0 simply hides that section.
  const reactionCount =
    cachedReactionsData?.reaction_count ?? (liveReactionCount > 0 ? liveReactionCount : undefined);

  // Single PubChem enrichment for the whole extraction: feeds both the
  // receipt match count and the StructureBrowser cards below (passed down as
  // `pubchem`), so the visible page is not enriched twice. No-ops unless the
  // user opted in; hits are cached server-side.
  const substancesForEnrichment = useMemo(() => activeResult?.substances ?? [], [activeResult]);
  const { enabled: pubchemEnabled, available: pubchemAvailable } = usePubChemPreferences();
  const pubchemStates = usePubChemEnrichment(substancesForEnrichment);
  const pubchem = useMemo(() => {
    // Count over DISTINCT real InChIKeys (the enrichment hook dedups too), so
    // a repeated compound cannot inflate the totals. Track errored lookups
    // separately from matches so a network failure is not reported as "0 of N".
    const seen = new Set<string>();
    let total = 0;
    let matched = 0;
    let settled = 0;
    let errored = 0;
    let mwMin: number | undefined;
    let mwMax: number | undefined;
    for (const s of substancesForEnrichment) {
      if (!isRealInchiKey(s.inchi_key) || seen.has(s.inchi_key)) continue;
      seen.add(s.inchi_key);
      total += 1;
      const st = pubchemStates.get(s.inchi_key);
      if (!st || st.state === "loading") continue;
      settled += 1;
      if (st.state === "error") {
        errored += 1;
        continue;
      }
      if (st.data?.status === "exact") {
        matched += 1;
        const mw = st.data.molecular_weight;
        if (mw != null) {
          mwMin = mwMin == null ? mw : Math.min(mwMin, mw);
          mwMax = mwMax == null ? mw : Math.max(mwMax, mw);
        }
      }
    }
    return {
      active: pubchemEnabled && pubchemAvailable,
      matched,
      total,
      settled,
      errored,
      mwMin,
      mwMax,
    };
  }, [substancesForEnrichment, pubchemStates, pubchemEnabled, pubchemAvailable]);

  // Receipt is extraction-level, but the SearchFilter above narrows the grid
  // below — surface a cue so the count never silently contradicts an empty grid.
  const filtersActive = hasActiveFilters(filters);
  const filteredCount = useMemo(
    () =>
      filtersActive
        ? filterSubstances(substancesForEnrichment, filters).length
        : substancesForEnrichment.length,
    [substancesForEnrichment, filters, filtersActive],
  );

  // Abbreviation count is a server-computed aggregate (persisted, so it also
  // survives reopening a historical extraction — the per-substance maps are
  // not stored). Metal count is a cheap client-side formula scan.
  const abbreviationCount = activeResult?.abbreviation_count ?? 0;
  const metalCount = useMemo(
    () => substancesForEnrichment.filter((s) => formulaHasMetal(s.molecular_formula)).length,
    [substancesForEnrichment],
  );

  return (
    <PageContainer data-slot="browse-page">
      <header className="space-y-2">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Browse
        </h1>
        <p className="text-base text-foreground-muted">
          {hasExtraction
            ? `Structures and reactions extracted from ${activeResult.filename}.`
            : "Browse extracted structures and reactions."}
        </p>
      </header>

      {!hasExtraction ? (
        <div className="mt-16">
          <EmptyState
            icon={FileUpIcon}
            title="No extraction loaded"
            message="Upload a ChemDraw file or open a past extraction from your history to start browsing."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Link to="/" className={buttonVariants({ size: "lg" }) + " gap-2"}>
                  <FileUpIcon className="size-4" />
                  Upload a file
                </Link>
                <Link
                  to="/history"
                  className={buttonVariants({ variant: "outline", size: "lg" }) + " gap-2"}
                >
                  <HistoryIcon className="size-4" />
                  Open history
                </Link>
              </div>
            }
          />
        </div>
      ) : (
        <>
          {isHistoricalView && (
            <div className="mt-6 flex items-center gap-3">
              <span className="text-caption text-foreground-muted">
                Viewing past extraction: {activeResult.filename}
              </span>
              <button
                onClick={onBackToLatest}
                className="text-caption text-primary underline-offset-2 hover:underline"
              >
                Back to latest
              </button>
            </div>
          )}

          <SearchFilter value={filters} onChange={setFilters} className="mt-6" />

          <section className="mt-6">
            <BrowseBento
              filename={activeResult.filename}
              format={activeResult.format}
              fileSize={activeResult.file_size}
              extractionTimeMs={activeResult.extraction_time_ms}
              info={activeResult.info}
              structureCount={activeResult.substances.length}
              filteredCount={filteredCount}
              filtersActive={filtersActive}
              missingInchi={activeResult.substances
                .filter((s) => !s.inchi?.trim())
                .map((s) => s.molecular_formula ?? "")}
              warnings={activeResult.warnings}
              reactionCount={reactionCount}
              pubchem={pubchem}
              abbreviationCount={abbreviationCount}
              metalCount={metalCount}
            />
          </section>

          <div className="mt-10">
            <ExtractionTabs
              // Use the actual substance array length so the tab count and the
              // receipt's headline count share one source and cannot disagree.
              substanceCount={activeResult.substances.length}
              reactionsTabProps={{
                file: selectedFile,
                filename: activeResult.filename,
                cachedReactions: cachedReactionsData?.reactions ?? null,
                cachedExtractionTimeMs: cachedReactionsData?.extraction_time_ms,
                cachedFormat: cachedReactionsData?.format,
                onReactionsCountChange,
              }}
            >
              <StructureBrowser
                extractionId={activeExtractionId}
                onReset={onReset}
                onSearchWithin={onSearchWithin}
                reactionsAvailable={liveReactionCount > 0}
                filters={filters}
                depiction={depiction}
                onDepictionChange={setDepiction}
                pubchem={pubchemStates}
              />
            </ExtractionTabs>
          </div>
        </>
      )}
    </PageContainer>
  );
}
