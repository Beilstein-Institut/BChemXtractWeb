/**
 * ReactionsTab — orchestrator for the Reactions tab body (Plan 10-05).
 *
 * Decides between five sub-states (UI-SPEC §3):
 *   - idle (pre-extract): ExperimentalBanner + EmptyState + "Extract reactions" CTA
 *     (or a "Re-upload" variant when the browser doesn't still hold the File object).
 *   - loading: Spinner + "Extracting reactions from {filename}…"
 *   - success with reactions: metadata recap + list of ReactionCard + ReactionSheet
 *   - success with zero reactions: "No reactions detected" EmptyState
 *   - error: "Reaction extraction didn't work" EmptyState + retry button
 *
 * D-06 timeout contract: a success response with non-empty `warnings` surfaces
 * as a sonner toast; the main body renders normally (reactions list or the
 * zero-reactions EmptyState depending on `reactions.length`). The toast is
 * shown exactly once per success cycle (guarded by `timeoutToastShown` ref).
 *
 * D-23 hydration: when `cachedReactions` is non-null (e.g., the parent loaded
 * a historical extraction with reaction_count > 0 and fetched
 * /api/extractions/{id}/reactions), the tab bypasses the extract-trigger flow
 * entirely and renders the cached list immediately.
 */
import { useEffect, useRef, useState } from "react";
import {
  AlertCircleIcon,
  ArrowRightLeftIcon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { ExperimentalBanner } from "@/components/ExperimentalBanner";
import { ReactionCard } from "@/components/ReactionCard";
import { ReactionSheet } from "@/components/ReactionSheet";
import { useReactions } from "@/hooks/useReactions";
import type { ReactionResponse } from "@/types/chemistry";

export interface ReactionsTabProps {
  /**
   * File bytes held in browser memory from the original upload. Null when the
   * user loaded a historical extraction from History (re-upload is required
   * unless `cachedReactions` is populated).
   */
  file: File | null;
  /**
   * Pre-cached reactions from a prior /api/reactions call for this
   * extraction (populated by the parent via GET /api/extractions/{id}/reactions
   * when the active view is historical and reaction_count > 0 — D-23).
   * When non-null, bypasses the extract-trigger flow and renders the cached
   * list directly.
   */
  cachedReactions?: ReactionResponse[] | null;
  /** Extraction duration for the cached-reactions metadata recap. */
  cachedExtractionTimeMs?: number;
  /** File format for the cached-reactions metadata recap. */
  cachedFormat?: string;
  /** Display filename override — used in the loading message. */
  filename?: string;
  /**
   * Fired whenever the visible reaction count changes (live extraction success,
   * cached hydration, or reset to zero). Lets the parent thread a
   * `reactionsAvailable` boolean down to siblings such as ExportMenu so the
   * RXN/RDfile entry enables/disables in lockstep with what the user sees.
   */
  onReactionsCountChange?: (count: number) => void;
}

export function ReactionsTab({
  file,
  cachedReactions = null,
  cachedExtractionTimeMs,
  cachedFormat,
  filename,
  onReactionsCountChange,
}: ReactionsTabProps) {
  const { state, result, errorMessage, extract } = useReactions();
  const [sheetIndex, setSheetIndex] = useState<number | null>(null);
  const timeoutToastShown = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Surface warnings (typically D-06 timeout) as a toast exactly once per
  // success cycle — resets to unshown whenever state leaves 'success'.
  useEffect(() => {
    if (state === "success" && result && result.warnings.length > 0) {
      if (!timeoutToastShown.current) {
        result.warnings.forEach((w) => {
          toast(w, { duration: 5000 });
        });
        timeoutToastShown.current = true;
      }
    }
    if (state !== "success") {
      timeoutToastShown.current = false;
    }
  }, [state, result]);

  const isCached = cachedReactions !== null;
  const reactionsFromHook = state === "success" ? result?.reactions ?? [] : [];
  const reactions: ReactionResponse[] = isCached
    ? cachedReactions!
    : reactionsFromHook;

  useEffect(() => {
    onReactionsCountChange?.(reactions.length);
  }, [reactions.length, onReactionsCountChange]);

  const displayFilename =
    filename ?? file?.name ?? result?.filename ?? "this file";

  function handleExtract() {
    if (!file) return;
    extract(file);
  }

  function handleReupload(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0];
    if (next) extract(next);
  }

  // Branch selectors — exclusive at the render site. The order of checks
  // mirrors the typical user flow: idle → loading → success (reactions
  // OR zero) → error. Cached reactions collapse the idle branches.
  const showLoading = state === "loading";
  const showError = state === "error";

  // Success with at least one reaction (either cached or fresh).
  const showSuccessList = !showLoading && !showError && reactions.length > 0;

  // Success with zero reactions — either a completed extraction that found
  // none, or a cached-reactions path with an empty array.
  const showZeroReactions =
    !showLoading &&
    !showError &&
    !showSuccessList &&
    ((state === "success" &&
      result !== null &&
      result.reactions.length === 0) ||
      (isCached && reactions.length === 0));

  // Idle — neither a completed call nor cached reactions. Split by file
  // presence between the extract-trigger and re-upload variants.
  const showIdle =
    !showLoading && !showError && !showSuccessList && !showZeroReactions;

  const extractionTimeMs = isCached
    ? cachedExtractionTimeMs
    : result?.extraction_time_ms;
  const displayFormat = isCached ? cachedFormat : result?.format;

  return (
    <div className="mt-6 space-y-6">
      <ExperimentalBanner />

      {/* Idle — pre-extract: file is in memory, user clicks CTA to trigger */}
      {showIdle && file && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ArrowRightLeftIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No reactions extracted yet</EmptyTitle>
            <EmptyDescription>
              Reaction extraction runs on demand. It may take up to 30 seconds.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={handleExtract}>
              Extract reactions from this file
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {/* Idle — re-upload: historical view, file bytes not in memory */}
      {showIdle && !file && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UploadIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Re-upload to extract reactions</EmptyTitle>
            <EmptyDescription>
              Your ChemDraw file isn't in memory — re-select it to extract
              reactions.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => fileInputRef.current?.click()}>
              Re-upload to extract reactions
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".cdx,.cdxml"
              className="hidden"
              onChange={handleReupload}
              aria-label="Re-upload CDX or CDXML file"
            />
          </EmptyContent>
        </Empty>
      )}

      {/* Loading — extract in flight */}
      {showLoading && (
        <div
          className="flex flex-col items-center gap-4 py-16"
          role="status"
          aria-live="polite"
        >
          <Spinner className="size-8" />
          <p className="text-body text-muted-foreground">
            Extracting reactions from {displayFilename}…
          </p>
        </div>
      )}

      {/* Success — list of reactions */}
      {showSuccessList && (
        <>
          <p className="text-caption text-muted-foreground">
            {reactions.length} reaction{reactions.length === 1 ? "" : "s"}
            {!isCached &&
              extractionTimeMs !== undefined &&
              ` · extracted in ${(extractionTimeMs / 1000).toFixed(1)}s`}
            {displayFormat && ` · ${displayFormat.toUpperCase()}`}
          </p>
          <ul className="space-y-8 list-none p-0 m-0">
            {reactions.map((r, i) => (
              <li key={i}>
                <ReactionCard
                  reaction={r}
                  reactionIndex={i}
                  onOpen={(idx) => setSheetIndex(idx)}
                  isActive={sheetIndex === i}
                />
              </li>
            ))}
          </ul>
          <ReactionSheet
            reaction={
              sheetIndex !== null ? reactions[sheetIndex] ?? null : null
            }
            reactionIndex={sheetIndex ?? 0}
            totalCount={reactions.length}
            open={sheetIndex !== null}
            onOpenChange={(open) => {
              if (!open) setSheetIndex(null);
            }}
            onPrev={() =>
              setSheetIndex((i) => (i !== null && i > 0 ? i - 1 : i))
            }
            onNext={() =>
              setSheetIndex((i) =>
                i !== null && i < reactions.length - 1 ? i + 1 : i,
              )
            }
          />
        </>
      )}

      {/* Success — zero reactions detected */}
      {showZeroReactions && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ArrowRightLeftIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No reactions detected in this file</EmptyTitle>
            <EmptyDescription>
              {displayFilename} didn't contain any detectable reactions. Try a
              different ChemDraw file.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* Error — extraction failed */}
      {showError && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircleIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Reaction extraction didn't work</EmptyTitle>
            <EmptyDescription>
              Something went wrong. {errorMessage ?? "Please try again."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={handleExtract} disabled={!file}>
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}
