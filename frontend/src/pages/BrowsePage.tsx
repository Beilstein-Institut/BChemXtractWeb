/**
 * BrowsePage — paginated structure grid + Reactions tab (route: `/browse`).
 *
 * Renders <ExtractionTabs> with <StructureBrowser> for the currently active
 * extraction. When no extraction is active, shows an empty state with CTAs
 * back to Extract and History.
 */
import { FileUpIcon, HistoryIcon } from "lucide-react";
import { StructureBrowser } from "@/components/StructureBrowser";
import { ExtractionTabs } from "@/components/ExtractionTabs";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/lib/Link";
import type {
  ExtractionResponse,
  ReactionExtractionResponse,
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
  return (
    <>
      <header className="pt-2">
        <h1 className="text-display font-semibold leading-[1.10] tracking-tight">
          Browse
        </h1>
        <p className="mt-4 text-sub-heading font-normal text-muted-foreground tracking-tight">
          Explore the structures and reactions in the active extraction.
        </p>
      </header>

      {activeExtractionId === null || activeResult === null ? (
        <div className="mt-16">
          <EmptyState
            icon={FileUpIcon}
            title="No extraction loaded"
            message="Upload a ChemDraw file or reload one from your history to start browsing."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  to="/"
                  className={buttonVariants({ size: "lg" }) + " gap-2"}
                >
                  <FileUpIcon className="size-4" />
                  Upload a file
                </Link>
                <Link
                  to="/history"
                  className={
                    buttonVariants({ variant: "outline", size: "lg" }) + " gap-2"
                  }
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
            <div className="mt-8 flex items-center gap-3">
              <span className="text-[14px] text-muted-foreground">
                Viewing historical extraction
              </span>
              <button
                onClick={onBackToLatest}
                className="text-[14px] text-primary underline-offset-2 hover:underline"
              >
                Back to latest
              </button>
            </div>
          )}
          <div className="mt-8">
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
              />
            </ExtractionTabs>
          </div>
        </>
      )}
    </>
  );
}
