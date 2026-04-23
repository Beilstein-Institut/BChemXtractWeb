import {
  CheckCircle2Icon,
  ClockIcon,
  LoaderIcon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { BatchFileStatus } from "@/types/batch";

/**
 * BatchProgress — Phase 3 Liquid Glass wizard Step 2 (Task 10 rewrite).
 *
 * Overall crimson progress bar + per-file status list with Geist Mono file
 * names. A compact 3-up stat strip above the bar surfaces total / completed
 * / failed counts. Cancel is moved into an icon-adjacent secondary action
 * that opens the existing AlertDialog confirmation.
 *
 * `data-slot` additions follow Phase 3's contract:
 *   - `data-slot="process-step"`       (root)
 *   - `data-slot="batch-stats"`        (3-up stat row)
 *   - `data-slot="file-progress-list"` (per-file row list)
 *   - `data-slot="batch-stat"`         (individual stat cell)
 */
export interface BatchProgressProps {
  files: BatchFileStatus[];
  totalCount: number;
  onCancel: () => void;
}

type StatTone = "default" | "secondary" | "destructive";

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: StatTone;
}) {
  const toneClass =
    tone === "secondary"
      ? "text-secondary"
      : tone === "destructive"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div
      data-slot="batch-stat"
      className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3"
    >
      <span className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
        {label}
      </span>
      <span className={cn("font-display text-2xl font-semibold tabular-nums", toneClass)}>
        {value}
      </span>
    </div>
  );
}

function FileStatusIcon({ state }: { state: BatchFileStatus["state"] }) {
  switch (state) {
    case "queued":
      return (
        <ClockIcon
          className="size-4 shrink-0 text-foreground-muted"
          aria-hidden="true"
        />
      );
    case "processing":
      return (
        <LoaderIcon
          className="size-4 shrink-0 animate-spin text-primary"
          aria-hidden="true"
        />
      );
    case "done":
      return (
        <CheckCircle2Icon
          className="size-4 shrink-0 text-secondary"
          aria-hidden="true"
        />
      );
    case "failed":
      return (
        <XCircleIcon
          className="size-4 shrink-0 text-destructive"
          aria-hidden="true"
        />
      );
  }
}

export function BatchProgress({
  files,
  totalCount,
  onCancel,
}: BatchProgressProps) {
  const failedCount = files.filter((f) => f.state === "failed").length;
  const succeededCount = files.filter((f) => f.state === "done").length;
  // Progress bar should advance for every file that has FINISHED, regardless
  // of success or failure — otherwise a batch with any failures stalls the
  // bar mid-run even though the worker is making forward progress. The
  // succeededCount is still surfaced in the Completed stat cell below.
  const processedCount = succeededCount + failedCount;
  const progressValue =
    totalCount > 0 ? (processedCount / totalCount) * 100 : 0;
  const progressPercent = Math.round(progressValue);

  return (
    <div data-slot="process-step" className="space-y-6">
      <div
        data-slot="batch-stats"
        className="grid grid-cols-3 gap-3"
      >
        <Stat label="Total" value={totalCount} />
        <Stat label="Completed" value={succeededCount} tone="secondary" />
        <Stat label="Failed" value={failedCount} tone="destructive" />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Progress value={progressValue}>
            <ProgressLabel>
              {processedCount} of {totalCount} files
            </ProgressLabel>
            <ProgressValue>{() => `${progressPercent}%`}</ProgressValue>
          </Progress>
        </div>

        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full border-destructive text-destructive"
              />
            }
          >
            Cancel batch
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel batch?</AlertDialogTitle>
              <AlertDialogDescription>
                Processing will stop after the current file finishes. Completed
                results are kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep running</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:opacity-90"
                onClick={onCancel}
              >
                Stop batch
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <ul
        aria-live="polite"
        data-slot="file-progress-list"
        className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface"
      >
        {files.map((f) => (
          <li
            key={f.filename}
            data-slot="file-progress-row"
            data-state={f.state}
            className="flex min-h-[48px] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted/40"
          >
            <FileStatusIcon state={f.state} />
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
              {f.filename}
            </span>
            {f.state === "done" && (
              <span className="shrink-0 text-xs tabular-nums text-foreground-muted">
                {f.structureCount} structures
              </span>
            )}
            {f.state === "failed" && (
              <span
                className="max-w-[240px] shrink-0 truncate text-xs text-destructive"
                title={f.error}
              >
                {f.error.slice(0, 80)}
              </span>
            )}
            <span className="shrink-0 text-xs capitalize text-foreground-muted">
              {f.state}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
