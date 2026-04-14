import { useState, useEffect, useCallback } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";
import { Toaster, toast } from "sonner";
import { useExtract } from "@/hooks/useExtract";
import { useHistory } from "@/hooks/useHistory";
import { FileUpload } from "@/components/FileUpload";
import { ExtractionSummary } from "@/components/ExtractionSummary";
import { StructureGrid } from "@/components/StructureGrid";
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

  // Show a toast whenever extraction enters the error state (WR-04).
  useEffect(() => {
    if (state === "error" && errorMessage) {
      toast.error(errorMessage);
    }
  }, [state, errorMessage]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Historical view state: when user reloads a past extraction into the grid (D-06).
  const [historicalResult, setHistoricalResult] = useState<ExtractionResponse | null>(null);

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
    reset();
  }

  function handleBackToLatest() {
    setHistoricalResult(null);
  }

  // After a fresh extraction succeeds, refresh history list + stats
  useEffect(() => {
    if (state === "success") {
      refreshHistory();
    }
  }, [state, refreshHistory]);

  const handleReloadSuccess = useCallback((response: ExtractionResponse) => {
    setHistoricalResult(response);
  }, []);

  // Has at least one extraction ever been saved? Controls stats + history visibility (D-09).
  const hasAnyExtractions =
    total > 0 || entries.length > 0 || (stats !== null && stats.total_extractions > 0);

  return (
    <ThemeProvider defaultTheme="system" storageKey="bchemxtract-theme">
      <div className="min-h-screen bg-background text-foreground">
        <header className="flex items-center justify-end p-4">
          <ModeToggle />
        </header>

        <main className="mx-auto max-w-[980px] px-6 pt-16 pb-16">
          <h1 className="text-heading font-semibold">BChemXtractWeb</h1>
          <p className="mt-4 text-body text-muted-foreground">
            Extract chemical structures from ChemDraw files.
          </p>

          {/* FileUpload — always visible */}
          {(state === "idle" || state === "error") && (
            <div className="mt-12">
              <FileUpload onExtract={handleExtract} isLoading={false} />
            </div>
          )}
          {state === "loading" && (
            <div className="mt-12">
              <FileUpload
                onExtract={handleExtract}
                isLoading={true}
                loadingFilename={selectedFile?.name}
                loadingFileSize={selectedFile?.size}
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
                <StructureGrid response={activeResult} onReset={handleReset} />
              </div>
            </>
          )}

          {/* Stats section — hidden until first extraction exists (D-09) */}
          {hasAnyExtractions && (
            <div className="mt-[48px]">
              <h2 className="text-[28px] font-normal leading-[1.14] text-foreground mb-4">
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
