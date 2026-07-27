import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { BackToTop } from "@/components/BackToTop";
import { DeferredCommandPalette } from "@/components/DeferredCommandPalette";
import { PageSuspenseFallback } from "@/components/PageSuspenseFallback";
import { SiteFooter } from "@/components/SiteFooter";
import { ThemeProvider } from "@/components/theme-provider";
import { PubChemPreferencesProvider } from "@/context/PubChemPreferencesContext";
import { SearchProvider } from "@/context/SearchContext";
import { useAuth } from "@/hooks/useAuth";
import { useBatch } from "@/hooks/useBatch";
import { useCsrfToken } from "@/hooks/useCsrfToken";
import { useExtract } from "@/hooks/useExtract";
import { useHistory } from "@/hooks/useHistory";
import { getExtractionReactions, getHistoryDetail } from "@/lib/apiClient";
import { navigate, ROUTE_CHANGE_EVENT, useRoute } from "@/lib/router";
import { cn } from "@/lib/utils";
import { SEARCH_URL_EVENT } from "@/hooks/useSearchImpl";
import { BrowsePage } from "@/pages/BrowsePage";
import { ExtractPage } from "@/pages/ExtractPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { HomePage } from "@/pages/HomePage";
import type { ExtractionResponse, ReactionExtractionResponse } from "@/types/chemistry";

// Lazy-loaded routes: kept out of the initial bundle because they're
// only rendered in response to explicit navigation (legal pages via
// the footer, /about from nav, SearchResults only when ?q= is in the
// URL). HomePage/BrowsePage/ExtractPage/HistoryPage are eager — users hit
// them on the default flow and lazy-loading would introduce a skeleton flash.
const AboutPage = lazy(() => import("@/pages/AboutPage").then((m) => ({ default: m.AboutPage })));
const ImprintPage = lazy(() =>
  import("@/pages/ImprintPage").then((m) => ({ default: m.ImprintPage })),
);
const TermsPage = lazy(() => import("@/pages/TermsPage").then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() =>
  import("@/pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage })),
);
const LimitationsPage = lazy(() =>
  import("@/pages/LimitationsPage").then((m) => ({ default: m.LimitationsPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const SearchResults = lazy(() =>
  import("@/components/SearchResults").then((m) => ({ default: m.SearchResults })),
);
const BatchViewPage = lazy(() =>
  import("@/pages/BatchViewPage").then((m) => ({ default: m.BatchViewPage })),
);
const ViewPage = lazy(() => import("@/pages/ViewPage").then((m) => ({ default: m.ViewPage })));

/** Events that can change whether `?q=` is present in the URL. */
const SEARCH_URL_EVENTS = ["popstate", SEARCH_URL_EVENT, ROUTE_CHANGE_EVENT] as const;

function hasSearchQuery(): boolean {
  return new URLSearchParams(window.location.search).has("q");
}

function App() {
  // Bootstrap session + CSRF token BEFORE any other API call. Both hooks
  // fire-and-forget at the root — their return values
  // are intentionally unused here. Components that need session_id
  // (e.g. SettingsPage) call useAuth() again at their own level. Order
  // matters: useAuth() issues PUT /api/auth/me which mints the cookie,
  // useCsrfToken() then GETs the session-bound token. If the PUT happens
  // to race ahead of the token fetch, apiClient's 403/CSRF_INVALID retry
  // path recovers.
  void useAuth();
  void useCsrfToken();

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
    getUploadedFile,
  } = useBatch();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [historicalResult, setHistoricalResult] = useState<ExtractionResponse | null>(null);
  const [activeExtractionId, setActiveExtractionId] = useState<number | null>(null);
  const [cachedReactionsData, setCachedReactionsData] = useState<ReactionExtractionResponse | null>(
    null,
  );
  const [liveReactionCount, setLiveReactionCount] = useState(0);
  const [searchActive, setSearchActive] = useState<boolean>(hasSearchQuery);

  const activeResult = historicalResult ?? result;
  const isHistoricalView = historicalResult !== null;

  // Surface extract / batch error messages as toasts.
  useEffect(() => {
    if (state === "error" && errorMessage) toast.error(errorMessage);
  }, [state, errorMessage]);

  useEffect(() => {
    if (batchState === "error" && batchErrorMessage) toast.error(batchErrorMessage);
  }, [batchState, batchErrorMessage]);

  // On successful single-file extraction: refresh history + pin the new
  // extraction as active so the Browse page knows what to show.
  // why: useExtract emits a state machine from an external-ish source
  //      (network + JVM). setActiveExtractionId is a sync of that
  //      external transition, not a render-derived update.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (state !== "success") return;
    refreshHistory();
    if (result?.extraction_id) {
      setActiveExtractionId(result.extraction_id);
      if (window.location.pathname === "/extract") navigate("/browse");
    }
  }, [state, result, refreshHistory]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Batch completion refreshes the history list too.
  useEffect(() => {
    if (batchState === "complete") refreshHistory();
  }, [batchState, refreshHistory]);

  // Hydrate cached reactions for a loaded extraction. We skip the fetch
  // if the user is actively uploading a new file (selectedFile !== null)
  // since the Reactions tab will extract fresh data for that flow.
  useEffect(() => {
    const extractionId = activeResult?.extraction_id;
    if (!extractionId || selectedFile) {
      // Defer the reset one microtask so the effect body doesn't
      // synchronously push state (react-hooks/set-state-in-effect).
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

  // URL-gated SearchResults routing — `?q=` in the URL replaces the
  // current page with <SearchResults> regardless of the pathname.
  useEffect(() => {
    const sync = () => setSearchActive(hasSearchQuery());
    for (const evt of SEARCH_URL_EVENTS) window.addEventListener(evt, sync);
    return () => {
      for (const evt of SEARCH_URL_EVENTS) window.removeEventListener(evt, sync);
    };
  }, []);

  const handleExtract = useCallback(
    (file: File) => {
      setSelectedFile(file);
      setHistoricalResult(null);
      extract(file);
    },
    [extract],
  );

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setHistoricalResult(null);
    setActiveExtractionId(null);
    reset();
  }, [reset]);

  // The "back" target for a historical Browse view. A completed batch's full
  // results live on the Extract page's summary, not in Browse, so route there;
  // otherwise "latest" is the live single-file extraction. One source of truth
  // so the button's label (backToExtractAll) and its destination can't drift.
  const backToExtractSummary = batchState === "complete";

  const handleBackToLatest = useCallback(() => {
    setHistoricalResult(null);
    // Completed batch: always go back to its summary, regardless of any stale
    // single-file result.
    if (backToExtractSummary) {
      setActiveExtractionId(null);
      setSelectedFile(null);
      navigate("/extract");
      return;
    }
    // Otherwise pin the live single-file extraction. When there isn't one (the
    // user opened a file from History), there's nothing to pin, so go to the
    // Extract page rather than strand them on the empty Browse state.
    const latestId = result?.extraction_id ?? null;
    setActiveExtractionId(latestId);
    if (latestId === null) navigate("/extract");
  }, [backToExtractSummary, result?.extraction_id]);

  // inMemoryFile: the original upload if we still hold its bytes (batch files
  // viewed in the same session). Setting selectedFile lets the Reactions tab
  // extract on-demand instead of prompting a re-upload; null clears any stale
  // single-file File so a plain history view doesn't extract from the wrong one.
  const handleReloadSuccess = useCallback(
    (response: ExtractionResponse, inMemoryFile: File | null = null) => {
      setHistoricalResult(response);
      setActiveExtractionId(response.extraction_id ?? null);
      setSelectedFile(inMemoryFile);
      navigate("/browse");
    },
    [],
  );

  // Fetches the full ExtractionResponse so the Bento (driven by `activeResult`)
  // and the paginated grid (driven by `activeExtractionId` via useBrowse) both
  // reflect the same extraction. Without the fetch, only the grid updates and
  // the Bento stays stuck on whatever last set historicalResult.
  const handleViewExtraction = useCallback(
    async (extractionId: number) => {
      try {
        const response = await getHistoryDetail(extractionId);
        // Batch files uploaded this session still have their bytes in memory —
        // hand them to the Reactions tab so reactions extract without re-upload.
        handleReloadSuccess(response, getUploadedFile(extractionId));
      } catch {
        toast.error("Couldn't load that extraction. Refresh and retry.");
      }
    },
    [handleReloadSuccess, getUploadedFile],
  );

  function renderRoute() {
    if (searchActive) return <SearchResults onViewExtraction={handleViewExtraction} />;
    switch (route) {
      case "/about":
        return <AboutPage />;
      case "/terms":
      case "/license": // legacy alias — the page lived at /license before the Terms rename
        return <TermsPage />;
      case "/imprint":
        return <ImprintPage />;
      case "/privacy":
        return <PrivacyPage />;
      case "/limitations":
        return <LimitationsPage />;
      case "/view":
        return <ViewPage />;
      case "/settings":
        return <SettingsPage />;
      case "/batch":
        return <BatchViewPage onViewExtraction={handleViewExtraction} />;
      case "/browse":
        return (
          <BrowsePage
            activeExtractionId={activeExtractionId}
            activeResult={activeResult}
            isHistoricalView={isHistoricalView}
            backToExtractAll={backToExtractSummary}
            selectedFile={selectedFile}
            cachedReactionsData={cachedReactionsData}
            liveReactionCount={liveReactionCount}
            onReset={handleReset}
            onBackToLatest={handleBackToLatest}
            onReactionsCountChange={setLiveReactionCount}
          />
        );
      case "/history":
        return (
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
        );
      case "/extract":
        return (
          <ExtractPage
            state={state}
            selectedFile={selectedFile}
            onExtract={handleExtract}
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
        );
      default:
        return <HomePage />;
    }
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="bchemxtract-theme">
      <PubChemPreferencesProvider>
        <SearchProvider>
          <div className="flex min-h-screen flex-col bg-background text-foreground">
            <AppHeader />
            <main
              className={cn(
                "mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6",
                // The home landing is a single-screen hero: center the content
                // vertically in the space between header and footer, and trim the
                // generous padding other routes use so header + hero + footer fit
                // without scrolling. The sticky header is in-flow, so no top
                // padding is needed to clear it.
                route === "/" && !searchActive
                  ? "flex flex-col justify-center py-3"
                  : "pt-20 pb-10 sm:pt-24 sm:pb-12",
              )}
            >
              <Suspense fallback={<PageSuspenseFallback />}>{renderRoute()}</Suspense>
            </main>
            <SiteFooter />
            {/* Globally mounted so ⌘K works from any route.
             *  Lazy-loaded on first ⌘K to keep motion/react out of the
             *  initial bundle — see DeferredCommandPalette.
             */}
            <DeferredCommandPalette />
            <BackToTop />
          </div>
          <Toaster richColors />
        </SearchProvider>
      </PubChemPreferencesProvider>
    </ThemeProvider>
  );
}

export default App;
