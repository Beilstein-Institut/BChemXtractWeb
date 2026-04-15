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
import type { ExtractionResponse } from "@/types/chemistry";

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

  const handleReloadSuccess = useCallback((response: ExtractionResponse) => {
    setHistoricalResult(response);
    setActiveExtractionId(response.extraction_id ?? null);
  }, []);

  // Has at least one extraction ever been saved? Controls stats + history visibility (D-09).
  const hasAnyExtractions =
    total > 0 || entries.length > 0 || (stats !== null && stats.total_extractions > 0);

  return (
    <ThemeProvider defaultTheme="system" storageKey="bchemxtract-theme">
      <div className="min-h-screen bg-background text-foreground">
        <AppHeader />

        <main className="mx-auto max-w-[980px] px-6 pt-24 pb-24">
          <h1 className="text-display font-semibold leading-[1.10] tracking-tight">BChemXtractWeb</h1>
          <p className="mt-4 text-sub-heading font-normal text-muted-foreground tracking-tight">
            Extract chemical structures from ChemDraw files.
          </p>

          {/* FileUpload — visible when idle/error and NOT during batch processing (D-13) */}
          {(state === "idle" || state === "error") && batchState !== "processing" && (
            <div className="mt-12">
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
            <div className="mt-12">
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
            <div className="mt-8">
              <StructureBrowser
                extractionId={activeExtractionId}
                onReset={() => setActiveExtractionId(null)}
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
              <div className="mt-8">
                <StructureBrowser extractionId={activeExtractionId} onReset={handleReset} />
              </div>
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
            <div className="mt-[32px]">
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
        </main>
      </div>
      <Toaster richColors />
    </ThemeProvider>
  );
}

export default App;
