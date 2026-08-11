/**
 * BrowsePage — bento landing + extraction tabs (route: `/browse`).
 *
 * The page is scoped to whichever extraction is "active" (set by
 * App.tsx after a successful upload or via `handleViewExtraction`).
 * Landing layout, top-down:
 *
 *   1. Page header (display title + sub-copy).
 *   2. `BrowseBento` — a compact extraction receipt (filename, dedup, InChI
 *      usability, PubChem matches when enabled, reactions when present).
 *      Describes the whole extraction. Export lives in the StructureBrowser
 *      toolbar below, so it is not duplicated here.
 *   3. `ExtractionTabs` wrapping `StructureBrowser` (full paginated
 *      grid/table view + Reactions tab).
 *
 * The header search (top bar) covers structure lookup; the browse page has
 * no in-page search bar.
 */
import { useCallback, useMemo, useState } from "react";
import { ArrowLeftIcon, FileUpIcon, HistoryIcon } from "lucide-react";
import { BrowseBento } from "@/components/browse/BrowseBento";
import { CdxViewerInline } from "@/components/CdxViewerInline";
import { ExtractionTabs } from "@/components/ExtractionTabs";
import { PageContainer } from "@/components/layout/PageContainer";
import { StructureBrowser } from "@/components/StructureBrowser";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DEFAULT_DEPICTION } from "@/lib/depiction";
import { Link } from "@/lib/Link";
import { isRealInchiKey } from "@/lib/inchi";
import { formulaHasMetal } from "@/lib/elements";
import { usePubChemEnrichment } from "@/hooks/usePubChemEnrichment";
import { usePubChemPreferences } from "@/hooks/usePubChemPreferences";
import type {
  Depiction,
  ExtractionResponse,
  ReactionExtractionResponse,
  Rect,
} from "@/types/chemistry";

export interface BrowsePageProps {
  activeExtractionId: number | null;
  activeResult: ExtractionResponse | null;
  isHistoricalView: boolean;
  /** True when the "back" target is a completed batch's summary on /extract. */
  backToExtractAll: boolean;
  selectedFile: File | null;
  cachedReactionsData: ReactionExtractionResponse | null;
  liveReactionCount: number;
  onReset: () => void;
  onBackToLatest: () => void;
  onReactionsCountChange: (count: number) => void;
}

export function BrowsePage({
  activeExtractionId,
  activeResult,
  isHistoricalView,
  backToExtractAll,
  selectedFile,
  cachedReactionsData,
  liveReactionCount,
  onReset,
  onBackToLatest,
  onReactionsCountChange,
}: BrowsePageProps) {
  const hasExtraction = activeExtractionId !== null && activeResult !== null;

  // Page-wide 2D layout: CDK (canonical layout) by default, ChemDraw via
  // the toolbar toggle. Drives every structure render on this page plus
  // the depiction sent with image exports. Deliberately NOT persisted —
  // the product default is CDK on every visit.
  const [depiction, setDepiction] = useState<Depiction>(DEFAULT_DEPICTION);

  // "View as drawn" expands an inline panel that stays pinned (sticky) while
  // the structure grid scrolls beneath it. The trigger lives in the card
  // (BrowseBento); its open state is here because the panel renders in the
  // same tall container as the tabs/grid below — sticky only pins within its
  // own containing block, so the panel MUST be a sibling of the grid (not
  // boxed in the short receipt section) to hover over it. Collapse it whenever
  // the active extraction changes (React's reset-on-prop-change pattern —
  // adjust during render, no effect) so a prior file's drawing can't linger.
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerForId, setViewerForId] = useState(activeExtractionId);
  // Occurrence rects to highlight on the pinned drawing; the card/sheet locate
  // buttons set this via handleLocate, so the panel (CdxViewerInline) and the
  // triggers (threaded to StructureBrowser via onLocate) share one source of
  // truth. Declared before the reset-on-prop-change block below, which calls
  // setHighlightRects.
  const [highlightRects, setHighlightRects] = useState<Rect[]>([]);
  if (activeExtractionId !== viewerForId) {
    setViewerForId(activeExtractionId);
    setViewerOpen(false);
    setHighlightRects([]);
  }

  const handleLocate = useCallback((occurrences: Rect[]) => {
    setHighlightRects(occurrences);
    setViewerOpen(true);
    // Wait a frame so a freshly-opened panel exists before scrolling to it.
    // Scroll by the panel's own id — the panel is a direct child of the tall
    // tabs container (for sticky to work), so there is no wrapper ref to hold.
    requestAnimationFrame(() =>
      document
        .getElementById("cdx-drawn-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, []);

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
            message="Upload a CDX or CDXML file, or open a past extraction from your history, to start browsing."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Link to="/extract" className={buttonVariants({ size: "lg" }) + " gap-2"}>
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
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-caption text-foreground-muted">
                Viewing past extraction: {activeResult.filename}
              </span>
              <button
                type="button"
                onClick={onBackToLatest}
                className={buttonVariants({ variant: "outline", size: "sm" }) + " gap-1.5"}
              >
                <ArrowLeftIcon className="size-4" />
                {backToExtractAll ? "Back to extract all" : "Back to latest"}
              </button>
            </div>
          )}

          <section className="mt-6">
            <BrowseBento
              filename={activeResult.filename}
              extractionId={activeResult.extraction_id}
              format={activeResult.format}
              fileSize={activeResult.file_size}
              extractionTimeMs={activeResult.extraction_time_ms}
              info={activeResult.info}
              structureCount={activeResult.substances.length}
              missingInchi={activeResult.substances
                .filter((s) => !s.inchi?.trim())
                .map((s) => s.molecular_formula ?? "")}
              warnings={activeResult.warnings}
              reactionCount={reactionCount}
              pubchem={pubchem}
              abbreviationCount={abbreviationCount}
              metalCount={metalCount}
              viewerOpen={viewerOpen}
              onToggleViewer={() => setViewerOpen((o) => !o)}
              viewerPanelId="cdx-drawn-panel"
            />
          </section>

          <div className="mt-10">
            {/* Pinned drawing: a DIRECT child of this tall container (not the
                short receipt section above) so its `sticky` positioning can
                hover over the scrolling grid below. */}
            {activeResult.extraction_id != null && (
              <CdxViewerInline
                id="cdx-drawn-panel"
                extractionId={activeResult.extraction_id}
                open={viewerOpen}
                highlights={highlightRects}
                onClose={() => {
                  setViewerOpen(false);
                  // Return focus to the "View as drawn" toggle (its aria-controls
                  // points at this panel) so keyboard users don't get dropped to
                  // <body> when the panel unmounts.
                  document.querySelector<HTMLElement>('[aria-controls="cdx-drawn-panel"]')?.focus();
                }}
              />
            )}
            <ExtractionTabs
              // Scope the tabs (and the on-demand reaction state they hold) to
              // one extraction. Within an extraction this instance persists, so
              // switching tabs keeps an already-extracted reaction; changing
              // extraction remounts, resetting live reaction state so results
              // from a prior file can't bleed into the new one.
              key={activeExtractionId}
              // Use the actual substance array length so the tab count and the
              // receipt's headline count share one source and cannot disagree.
              substanceCount={activeResult.substances.length}
              reactionsTabProps={{
                file: selectedFile,
                filename: activeResult.filename,
                extractionId: activeResult?.extraction_id ?? null,
                cachedReactions: cachedReactionsData?.reactions ?? null,
                cachedExtractionTimeMs: cachedReactionsData?.extraction_time_ms,
                cachedFormat: cachedReactionsData?.format,
                onReactionsCountChange,
              }}
            >
              <StructureBrowser
                extractionId={activeExtractionId}
                onReset={onReset}
                reactionsAvailable={liveReactionCount > 0}
                depiction={depiction}
                onDepictionChange={setDepiction}
                pubchem={pubchemStates}
                onLocate={handleLocate}
              />
            </ExtractionTabs>
          </div>
        </>
      )}
    </PageContainer>
  );
}
