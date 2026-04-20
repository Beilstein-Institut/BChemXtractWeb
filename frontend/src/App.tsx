import { useState, useEffect, useCallback } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { AppHeader } from "@/components/AppHeader";
import { Toaster, toast } from "sonner";
import { useExtract } from "@/hooks/useExtract";
import { useHistory } from "@/hooks/useHistory";
import { useBatch } from "@/hooks/useBatch";
import { SearchResults } from "@/components/SearchResults";
import { ExtractPage } from "@/pages/ExtractPage";
import { BrowsePage } from "@/pages/BrowsePage";
import { HistoryPage } from "@/pages/HistoryPage";
import { AboutPage } from "@/pages/AboutPage";
import { searchInputRef } from "@/lib/searchFocus";
import { getExtractionReactions } from "@/lib/apiClient";
import { navigate, useRoute } from "@/lib/router";
import type {
  ExtractionResponse,
  ReactionExtractionResponse,
} from "@/types/chemistry";

function App() {
  const route = useRoute();
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

  useEffect(() => {
    if (state === "error" && errorMessage) {
      toast.error(errorMessage);
    }
  }, [state, errorMessage]);

  useEffect(() => {
    if (batchState === "error" && batchErrorMessage) {
      toast.error(batchErrorMessage);
    }
  }, [batchState, batchErrorMessage]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [historicalResult, setHistoricalResult] = useState<ExtractionResponse | null>(null);
  const [activeExtractionId, setActiveExtractionId] = useState<number | null>(null);
  const [cachedReactionsData, setCachedReactionsData] =
    useState<ReactionExtractionResponse | null>(null);
  const [liveReactionCount, setLiveReactionCount] = useState(0);

  const activeResult = historicalResult ?? result;
  const isHistoricalView = historicalResult !== null;

  function handleExtract(file: File) {
    setSelectedFile(file);
    setHistoricalResult(null);
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

  useEffect(() => {
    if (state === "success") {
      refreshHistory();
    }
  }, [state, refreshHistory]);

  useEffect(() => {
    if (state === "success" && result?.extraction_id) {
      setActiveExtractionId(result.extraction_id);
    }
  }, [state, result]);

  useEffect(() => {
    if (batchState === "complete") {
      refreshHistory();
    }
  }, [batchState, refreshHistory]);

  useEffect(() => {
    const extractionId = activeResult?.extraction_id;
    if (!extractionId || selectedFile) {
      Promise.resolve().then(() => setCachedReactionsData(null));
      return;
    }

    const controller = new AbortController();
    getExtractionReactions(extractionId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
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
    navigate("/browse");
  }, []);

  const handleViewExtraction = useCallback((extractionId: number) => {
    setActiveExtractionId(extractionId);
    navigate("/browse");
  }, []);

  // URL-gated SearchResults routing — ?q= in the URL replaces the current
  // page with <SearchResults> on every route.
  const [hasSearchQuery, setHasSearchQuery] = useState<boolean>(() =>
    new URLSearchParams(window.location.search).has("q"),
  );
  useEffect(() => {
    function check() {
      setHasSearchQuery(new URLSearchParams(window.location.search).has("q"));
    }
    window.addEventListener("popstate", check);
    window.addEventListener("searchurlchange", check);
    window.addEventListener("routechange", check);
    return () => {
      window.removeEventListener("popstate", check);
      window.removeEventListener("searchurlchange", check);
      window.removeEventListener("routechange", check);
    };
  }, []);

  function handleSearchWithin() {
    if (!activeExtractionId) return;
    const params = new URLSearchParams(window.location.search);
    params.set("q", "");
    params.set("scope", `extraction:${activeExtractionId}`);
    window.history.replaceState(null, "", `?${params.toString()}`);
    window.dispatchEvent(new CustomEvent("searchurlchange"));
    searchInputRef.current?.focus();
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="bchemxtract-theme">
      <div className="min-h-screen bg-background text-foreground">
        <AppHeader />

        <main className="mx-auto max-w-[980px] px-6 pt-24 pb-24">
          {hasSearchQuery ? (
            <SearchResults />
          ) : route === "/about" ? (
            <AboutPage />
          ) : route === "/browse" ? (
            <BrowsePage
              activeExtractionId={activeExtractionId}
              activeResult={activeResult}
              isHistoricalView={isHistoricalView}
              selectedFile={selectedFile}
              cachedReactionsData={cachedReactionsData}
              liveReactionCount={liveReactionCount}
              onReset={handleReset}
              onBackToLatest={handleBackToLatest}
              onSearchWithin={handleSearchWithin}
              onReactionsCountChange={setLiveReactionCount}
            />
          ) : route === "/history" ? (
            <HistoryPage
              historyState={historyState}
              entries={entries}
              total={total}
              showAll={showAll}
              stats={stats}
              statsLoading={statsLoading}
              onToggleShowAll={toggleShowAll}
              onReload={reloadEntry}
              onDelete={deleteEntry}
              onReloadSuccess={handleReloadSuccess}
            />
          ) : (
            <ExtractPage
              state={state}
              selectedFile={selectedFile}
              result={result}
              historicalResult={historicalResult}
              onExtract={handleExtract}
              onReset={handleReset}
              batchState={batchState}
              batchFiles={batchFiles}
              batchId={batchId}
              batchCompletedCount={completedCount}
              batchFailedCount={failedCount}
              batchTotalStructures={batchTotalStructures}
              onStartBatch={startBatch}
              onCancelBatch={cancelBatchFn}
              onResetBatch={resetBatch}
              onViewExtraction={handleViewExtraction}
            />
          )}
        </main>
      </div>
      <Toaster richColors />
    </ThemeProvider>
  );
}

export default App;
