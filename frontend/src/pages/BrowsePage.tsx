/**
 * BrowsePage — bento landing + extraction tabs (route: `/browse`).
 *
 * Phase 3 Task 11 rewrite. The page is still scoped to whichever
 * extraction is "active" (set by App.tsx after a successful upload
 * or via `handleViewExtraction`). Landing layout, top-down:
 *
 *   1. Page header (display title + sub-copy).
 *   2. `SearchFilter` composite (debounced 250 ms query + 3 chips).
 *   3. `BrowseBento` — one-band bento (6 cols at lg): wide Structure
 *      preview hero + two square columns (Total/Unique stacked, Source
 *      format/Browse-all CTA stacked).
 *   4. `ExtractionTabs` wrapping `StructureBrowser` (full paginated
 *      grid/table view + Reactions tab).
 *
 * The bento consumes the full `activeResult.substances` list filtered
 * locally; the StructureBrowser below keeps its paginated server-driven
 * contract (Phase 6 `useBrowse` unchanged). Filters also reach the
 * browser via a `filters` prop so the paginated grid honours the same
 * chip + query state on the current page slice (client-side predicate —
 * server pagination is unmodified).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { FileUpIcon, HistoryIcon } from "lucide-react";
import { BrowseBento } from "@/components/browse/BrowseBento";
import { filterSubstances } from "@/components/browse/filterSubstances";
import { ExtractionTabs } from "@/components/ExtractionTabs";
import { PageContainer } from "@/components/layout/PageContainer";
import { SearchFilter } from "@/components/SearchFilter";
import { EMPTY_FILTERS, type BrowseFilters } from "@/components/browse/browseFilters";
import { StructureBrowser } from "@/components/StructureBrowser";
import { StructureDetail } from "@/components/StructureDetail";
import { Dialog } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DEFAULT_DEPICTION } from "@/lib/depiction";
import { Link } from "@/lib/Link";
import type {
  Depiction,
  ExtractionResponse,
  ReactionExtractionResponse,
  SubstanceResponse,
} from "@/types/chemistry";

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
  const [activeSubstance, setActiveSubstance] = useState<SubstanceResponse | null>(null);
  // Page-wide 2D layout: ChemDraw (original drawing) by default, CDK via
  // the toolbar toggle. Drives every structure render on this page plus
  // the depiction sent with image exports. Deliberately NOT persisted —
  // the product default is ChemDraw on every visit.
  const [depiction, setDepiction] = useState<Depiction>(DEFAULT_DEPICTION);

  const browserRef = useRef<HTMLDivElement | null>(null);

  const allSubstances = useMemo<SubstanceResponse[]>(
    () => activeResult?.substances ?? [],
    [activeResult],
  );

  const filteredSubstances = useMemo(
    () => filterSubstances(allSubstances, filters),
    [allSubstances, filters],
  );

  const handleOpenSubstance = useCallback(
    (index: number) => {
      const match = filteredSubstances[index];
      if (match) setActiveSubstance(match);
    },
    [filteredSubstances],
  );

  const handleBrowseAll = useCallback(() => {
    browserRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

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
              substances={filteredSubstances}
              totalSubstances={allSubstances.length}
              format={activeResult.format}
              onBrowseAll={handleBrowseAll}
              onOpenSubstance={handleOpenSubstance}
              depiction={depiction}
            />
          </section>

          <div ref={browserRef} className="mt-10">
            <ExtractionTabs
              substanceCount={activeResult.structure_count}
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
              />
            </ExtractionTabs>
          </div>

          <Dialog
            open={activeSubstance !== null}
            onOpenChange={(open) => {
              if (!open) setActiveSubstance(null);
            }}
          >
            {activeSubstance && (
              <StructureDetail substance={activeSubstance} depiction={depiction} />
            )}
          </Dialog>
        </>
      )}
    </PageContainer>
  );
}
