import { useState, useEffect, useCallback } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { AppHeader } from "@/components/AppHeader";
import { Toaster, toast } from "sonner";
import { useExtract } from "@/hooks/useExtract";
import { useHistory } from "@/hooks/useHistory";
import { useBatch } from "@/hooks/useBatch";
import { FileUpload } from "@/components/FileUpload";
import { BatchProgress } from "@/components/BatchProgress";
import { BatchSummary } from "@/components/BatchSummary";
import { ExtractionSummary } from "@/components/ExtractionSummary";
import { StructureBrowser } from "@/components/StructureBrowser";
import { StatCard } from "@/components/StatCard";
import { HistoryList } from "@/components/HistoryList";
import { SearchResults } from "@/components/SearchResults";
import { ExtractionTabs } from "@/components/ExtractionTabs";
import { searchInputRef } from "@/lib/searchFocus";
import { getExtractionReactions } from "@/lib/apiClient";
import type {
  ExtractionResponse,
  ReactionExtractionResponse,
} from "@/types/chemistry";

function App() {
  const { state, result, errorMessage, extract, reset } = useExtract();
  const {
    historyState,
    entries,
    total,
    showAll,
    stats,
    statsLoading,
    toggleShowAll,
    deleteEntry,
    reloadEntry,
    refresh: refreshHistory,
  } = useHistory();

  const {
    state: batchState,
    files: batchFiles,
    batchId,
    completedCount,
    failedCount,
    totalStructures: batchTotalStructures,
    errorMessage: batchErrorMessage,
    startBatch,
    cancelBatch: cancelBatchFn,
    reset: resetBatch,
  } = useBatch();

  // Show a toast whenever extraction enters the error state (WR-04).
  useEffect(() => {
    if (state === "error" && errorMessage) {
      toast.error(errorMessage);
    }
  }, [state, errorMessage]);

  // Show a toast whenever batch enters the error state.
  useEffect(() => {
    if (batchState === "error" && batchErrorMessage) {
      toast.error(batchErrorMessage);
    }
  }, [batchState, batchErrorMessage]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Historical view state: when user reloads a past extraction into the grid (D-06).
  const [historicalResult, setHistoricalResult] = useState<ExtractionResponse | null>(null);

  // Active extraction ID for paginated browsing (Phase 6).
  const [activeExtractionId, setActiveExtractionId] = useState<number | null>(null);

  // Plan 10 D-23: cached reactions for the active extraction, populated from
  // GET /api/extractions/{id}/reactions when the active view is historical
  // (no File object held in browser) and the extraction has reaction_count > 0.
  // On fresh uploads, this stays null — the Reactions tab user triggers a
  // POST /api/reactions call via the pre-extract CTA.
  const [cachedReactionsData, setCachedReactionsData] =
    useState<ReactionExtractionResponse | null>(null);

  // Determine what to display in the results area:
  //   - historicalResult: user clicked "Reload extraction" on a history entry
  //   - result: fresh extraction just completed
  const activeResult = historicalResult ?? result;
  const isHistoricalView = historicalResult !== null;

  // Show results grid when either a fresh extraction succeeded OR a historical reload is active
  const showResults = (state === "success" && result !== null) || isHistoricalView;

  function handleExtract(file: File) {
    setSelectedFile(file);
    setHistoricalResult(null); // clear any historical view on new extraction
    extract(file);
  }

  function handleReset() {
    setSelectedFile(null);
    setHistoricalResult(null);
    setActiveExtractionId(null);
    reset();
  }

  function handleBackToLatest() {
    setHistoricalResult(null);
    setActiveExtractionId(result?.extraction_id ?? null);
  }

  // After a fresh extraction succeeds, refresh history list + stats
  useEffect(() => {
    if (state === "success") {
      refreshHistory();
    }
  }, [state, refreshHistory]);

  // After a fresh extraction succeeds, set the active extraction ID for paginated browsing
  useEffect(() => {
    if (state === "success" && result?.extraction_id) {
      setActiveExtractionId(result.extraction_id);
    }
  }, [state, result]);

  // After batch completes, refresh history to include new extractions
  useEffect(() => {
    if (batchState === "complete") {
      refreshHistory();
    }
  }, [batchState, refreshHistory]);

  // Plan 10 D-23: when the user reloads a historical extraction into the
  // results view (no File object in memory), hydrate the Reactions tab from
  // the cached /api/extractions/{id}/reactions endpoint so the tab renders
  // the stored reactions directly instead of the pre-extract CTA. Freshly
  // uploaded files skip this — the user kicks off /api/reactions via the
  // in-tab button. Aborts on id-change / unmount. All setState calls land
  // inside async .then()/.catch() handlers (never the effect body) so the
  // react-hooks/set-state-in-effect lint passes.
  useEffect(() => {
    const extractionId = activeResult?.extraction_id;
    // Only hydrate on historical views — when a fresh File is held, the
    // user is expected to trigger reaction extraction from inside the tab.
    if (!extractionId || selectedFile) {
      // Fire-and-reset into a microtask to avoid the set-state-in-effect
      // pattern; the React batcher still lands this before the next paint.
      Promise.resolve().then(() => setCachedReactionsData(null));
      return;
    }

    const controller = new AbortController();
    getExtractionReactions(extractionId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        // Only surface the cache when there are reactions to show. Empty
        // arrays (reaction_count === 0) fall through to the "Re-upload"
        // idle flow so the user can opt into extraction.
        setCachedReactionsData(data.reactions.length > 0 ? data : null);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setCachedReactionsData(null);
      });

    return () => controller.abort();
  }, [activeResult?.extraction_id, selectedFile]);

  const handleReloadSuccess = useCallback((response: ExtractionResponse) => {
    setHistoricalResult(response);
    setActiveExtractionId(response.extraction_id ?? null);
  }, []);

  // URL-gated SearchResults routing (Plan 09-07).
  //
  // When the URL carries `?q=`, App renders <SearchResults> in place of the
  // upload/browse/fresh-extraction views. Plan 06's useSearch already
  // dispatches `window.CustomEvent('searchurlchange')` after every
  // replaceState, so App can listen without importing or modifying useSearch
  // (per plan fix #7). popstate covers browser back/forward.
  const [hasSearchQuery, setHasSearchQuery] = useState<boolean>(() =>
    new URLSearchParams(window.location.search).has("q"),
  );
  useEffect(() => {
    function check() {
      setHasSearchQuery(new URLSearchParams(window.location.search).has("q"));
    }
    window.addEventListener("popstate", check);
    window.addEventListener("searchurlchange", check);
    return () => {
      window.removeEventListener("popstate", check);
      window.removeEventListener("searchurlchange", check);
    };
  }, []);

  // "Search within this extraction" handler (D-20). Writes the scope param to
  // the URL, dispatches `searchurlchange` so our own listener flips
  // `hasSearchQuery` and mounts SearchResults, then focuses the header
  // SearchInput via the shared ref (fix #8 — NO document.querySelector).
  function handleSearchWithin() {
    if (!activeExtractionId) return;
    const params = new URLSearchParams(window.location.search);
    params.set("q", ""); // prime with empty query; user types → debounce fires
    params.set("scope", `extraction:${activeExtractionId}`);
    window.history.replaceState(null, "", `?${params.toString()}`);
    window.dispatchEvent(new CustomEvent("searchurlchange"));
    searchInputRef.current?.focus();
  }

  // Has at least one extraction ever been saved? Controls stats + history visibility (D-09).
  const hasAnyExtractions =
    total > 0 || entries.length > 0 || (stats !== null && stats.total_extractions > 0);

  return (
    <ThemeProvider defaultTheme="system" storageKey="bchemxtract-theme">
      <div className="min-h-screen bg-background text-foreground">
        <AppHeader />

        <main className="mx-auto max-w-[980px] px-6 pt-24 pb-24">
          <h1 className="text-display font-semibold leading-[1.10] tracking-tight">
            BChemXtractWeb
          </h1>
          <p className="mt-4 text-sub-heading font-normal text-muted-foreground tracking-tight">
            Extract chemical structures from ChemDraw files.
          </p>

          {/* Global search view — rendered when the URL carries a ?q= param (D-11).
              Replaces the upload/browse/fresh-extraction views so the user's
              search takes over the main area. */}
          {hasSearchQuery && <SearchResults />}

          {/* All of the existing non-search views are wrapped so they only
              render when no ?q= is active. */}
          {!hasSearchQuery && (
            <>
              {/* FileUpload — visible when idle/error and NOT during batch processing (D-13) */}
              {(state === "idle" || state === "error") && batchState !== "processing" && (
                <div id="extract" className="mt-12 scroll-mt-24">
                  <FileUpload
                    mode="batch"
                    onExtract={handleExtract}
                    onStartBatch={startBatch}
                    isLoading={false}
                    isBatchProcessing={false}
                  />
                </div>
              )}
              {state === "loading" && (
                <div id="extract" className="mt-12 scroll-mt-24">
                  <FileUpload
                    mode="batch"
                    onExtract={handleExtract}
                    onStartBatch={startBatch}
                    isLoading={true}
                    isBatchProcessing={false}
                    loadingFilename={selectedFile?.name}
                    loadingFileSize={selectedFile?.size}
                  />
                </div>
              )}

              {/* Batch progress — replaces drop zone during processing (D-13) */}
              {batchState === "processing" && (
                <div className="mt-12">
                  <BatchProgress
                    files={batchFiles}
                    completedCount={completedCount}
                    totalCount={batchFiles.length}
                    onCancel={cancelBatchFn}
                  />
                </div>
              )}

              {/* Batch summary — appears after completion, drop zone returned above (D-17) */}
              {batchState === "complete" && batchId && (
                <div className="mt-8">
                  <BatchSummary
                    batchId={batchId}
                    files={batchFiles}
                    totalFiles={batchFiles.length}
                    totalStructures={batchTotalStructures}
                    succeededCount={completedCount}
                    failedCount={failedCount}
                    onViewExtraction={(id) => setActiveExtractionId(id)}
                    onReset={resetBatch}
                  />
                </div>
              )}

              {/* Batch-initiated browsing — View clicked from BatchSummary */}
              {!showResults && activeExtractionId !== null && (
                <div id="browse" className="mt-8 scroll-mt-24">
                  <StructureBrowser
                    extractionId={activeExtractionId}
                    onReset={() => setActiveExtractionId(null)}
                    onSearchWithin={handleSearchWithin}
                  />
                </div>
              )}

              {/* Results area: fresh extraction OR historical reload */}
              {showResults && activeResult !== null && (
                <>
                  {/* Historical view badge (D-06) */}
                  {isHistoricalView && (
                    <div className="mt-8 flex items-center gap-3">
                      <span className="text-[14px] text-muted-foreground">
                        Viewing historical extraction
                      </span>
                      <button
                        onClick={handleBackToLatest}
                        className="text-[14px] text-primary underline-offset-2 hover:underline"
                      >
                        Back to latest
                      </button>
                    </div>
                  )}
                  <div className="mt-8">
                    <ExtractionSummary response={activeResult} onReset={handleReset} />
                  </div>
                  <ExtractionTabs
                    substanceCount={activeResult.structure_count}
                    reactionsTabProps={{
                      file: selectedFile,
                      filename: activeResult.filename,
                      // D-23: non-null only for historical extractions that
                      // had reactions saved (reaction_count > 0 on the
                      // returned ReactionExtractionResponse). Fresh uploads
                      // leave this null so the user triggers POST /api/reactions
                      // via the tab's pre-extract CTA.
                      cachedReactions: cachedReactionsData?.reactions ?? null,
                      cachedExtractionTimeMs:
                        cachedReactionsData?.extraction_time_ms,
                      cachedFormat: cachedReactionsData?.format,
                    }}
                  >
                    <div id="browse" className="scroll-mt-24">
                      <StructureBrowser
                        extractionId={activeExtractionId}
                        onReset={handleReset}
                        onSearchWithin={handleSearchWithin}
                      />
                    </div>
                  </ExtractionTabs>
                </>
              )}

              {/* Stats section — hidden until first extraction exists (D-09) */}
              {hasAnyExtractions && (
                <div className="mt-[48px]">
                  <h2 className="text-heading font-normal tracking-tight text-foreground mb-4">
                    Summary
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <StatCard
                      label="Total extractions"
                      value={stats?.total_extractions ?? ""}
                      loading={statsLoading && stats === null}
                    />
                    <StatCard
                      label="Unique structures"
                      value={stats?.unique_structures ?? ""}
                      loading={statsLoading && stats === null}
                    />
                    <StatCard
                      label="Most common formula"
                      value={stats?.most_common_formula ?? ""}
                      loading={statsLoading && stats === null}
                    />
                  </div>
                </div>
              )}

              {/* History list — hidden until first extraction exists (D-09) */}
              {hasAnyExtractions && (
                <div id="history" className="mt-[32px] scroll-mt-24">
                  <HistoryList
                    entries={entries}
                    total={total}
                    loading={historyState === "loading"}
                    showAll={showAll}
                    onToggleShowAll={toggleShowAll}
                    onReload={reloadEntry}
                    onDelete={async (id) => {
                      try {
                        await deleteEntry(id);
                      } catch {
                        toast.error("Could not delete extraction. Try again.");
                      }
                    }}
                    onReloadSuccess={handleReloadSuccess}
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>
      <Toaster richColors />
    </ThemeProvider>
  );
}

export default App;
