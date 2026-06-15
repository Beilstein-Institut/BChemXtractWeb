/**
 * ReactionsTab — orchestrator for the Reactions tab body.
 *
 * Decides between five sub-states:
 *   - idle (pre-extract): ExperimentalBanner + EmptyState + "Extract reactions" CTA
 *     (or a "Re-upload" variant when the browser doesn't still hold the File object).
 *   - loading: Spinner + "Extracting reactions from {filename}…"
 *   - success with reactions: metadata recap + list of ReactionCard + ReactionSheet
 *   - success with zero reactions: "No reactions detected" EmptyState
 *   - error: "Reaction extraction didn't work" EmptyState + retry button
 *
 * Timeout contract: a success response with non-empty `warnings` surfaces
 * as a sonner toast; the main body renders normally (reactions list or the
 * zero-reactions EmptyState depending on `reactions.length`). The toast is
 * shown exactly once per success cycle (guarded by `timeoutToastShown` ref).
 *
 * Hydration: when `cachedReactions` is non-null (e.g., the parent loaded
 * a historical extraction with reaction_count > 0 and fetched
 * /api/extractions/{id}/reactions), the tab bypasses the extract-trigger flow
 * entirely and renders the cached list immediately.
 */
import { useEffect, useRef, useState } from "react";
import { AlertCircleIcon, ArrowRightLeftIcon, UploadIcon } from "lucide-react";
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
   * when the active view is historical and reaction_count > 0).
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

  // Surface warnings (typically a timeout) as a toast exactly once per
  // success cycle — resets to unshown whenever state leaves 'success'.
  useEffect(() => {
    if (state !== "success") {
      timeoutToastShown.current = false;
      return;
    }
    if (timeoutToastShown.current) return;
    if (!result || result.warnings.length === 0) return;
    result.warnings.forEach((w) => toast(w, { duration: 5000 }));
    timeoutToastShown.current = true;
  }, [state, result]);

  const isCached = cachedReactions !== null;
  const reactions: ReactionResponse[] = isCached
    ? cachedReactions!
    : state === "success"
      ? (result?.reactions ?? [])
      : [];

  useEffect(() => {
    onReactionsCountChange?.(reactions.length);
  }, [reactions.length, onReactionsCountChange]);

  const displayFilename = filename ?? file?.name ?? result?.filename ?? "this file";

  function handleExtract() {
    if (!file) return;
    extract(file);
  }

  function handleReupload(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0];
    if (next) extract(next);
  }

  // Branch selector — exactly one branch renders per user flow:
  //   idle → loading → (successList | zeroReactions) → error
  // Cached reactions collapse directly into successList / zeroReactions.
  type Branch = "loading" | "error" | "successList" | "zeroReactions" | "idle";
  function pickBranch(): Branch {
    if (state === "loading") return "loading";
    if (state === "error") return "error";
    if (reactions.length > 0) return "successList";
    const completedWithZero = state === "success" && result !== null;
    if (completedWithZero || isCached) return "zeroReactions";
    return "idle";
  }
  const branch = pickBranch();

  const extractionTimeMs = isCached ? cachedExtractionTimeMs : result?.extraction_time_ms;
  const displayFormat = isCached ? cachedFormat : result?.format;

  return (
    <div className="mt-6 space-y-6">
      <ExperimentalBanner />

      {/* Idle — pre-extract: file is in memory, user clicks CTA to trigger */}
      {branch === "idle" && file && (
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
            <Button onClick={handleExtract}>Extract reactions from this file</Button>
          </EmptyContent>
        </Empty>
      )}

      {/* Idle — re-upload: historical view, file bytes not in memory */}
      {branch === "idle" && !file && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UploadIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Re-upload to extract reactions</EmptyTitle>
            <EmptyDescription>
              Your ChemDraw file isn't in memory — re-select it to extract reactions.
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
      {branch === "loading" && (
        <div className="flex flex-col items-center gap-4 py-16" role="status" aria-live="polite">
          <Spinner className="size-8" />
          <p className="text-body text-muted-foreground">
            Extracting reactions from {displayFilename}…
          </p>
        </div>
      )}

      {/* Success — list of reactions */}
      {branch === "successList" && (
        <>
          <p className="text-caption text-foreground/70">
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
            reaction={sheetIndex !== null ? (reactions[sheetIndex] ?? null) : null}
            reactionIndex={sheetIndex ?? 0}
            totalCount={reactions.length}
            open={sheetIndex !== null}
            onOpenChange={(open) => {
              if (!open) setSheetIndex(null);
            }}
            onPrev={() => setSheetIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
            onNext={() =>
              setSheetIndex((i) => (i !== null && i < reactions.length - 1 ? i + 1 : i))
            }
          />
        </>
      )}

      {/* Success — zero reactions detected */}
      {branch === "zeroReactions" && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ArrowRightLeftIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No reactions detected in this file</EmptyTitle>
            <EmptyDescription>
              {displayFilename} didn't contain any detectable reactions. Try a different ChemDraw
              file.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* Error — extraction failed */}
      {branch === "error" && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircleIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Reaction extraction failed</EmptyTitle>
            <EmptyDescription>
              {errorMessage ??
                "No detail returned. Retry, or open the file in ChemDraw to verify the reactions render."}
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
