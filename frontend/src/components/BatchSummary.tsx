import {
  CheckCircle2Icon,
  DownloadIcon,
  PlusIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadBatchZip } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import type { BatchFileStatus } from "@/types/batch";

/**
 * BatchSummary — Phase 3 Liquid Glass wizard Step 3 (Task 10 rewrite).
 *
 * Renders the post-completion stat strip + the per-file results list. The
 * surrounding bento grid of StructureCards is composed by the caller
 * (ExtractPage's ResultsStep) since cards are not yet accessible to this
 * summary module — the batch pipeline stores extractions in the database
 * and the cards come from a later fetch. This component intentionally
 * remains scoped to the stats + file list surface.
 *
 * All user-provided strings (filenames, error messages) are rendered as
 * React text children — escaped by React automatically (T-07-11).
 *
 * `data-slot` contract:
 *   - `data-slot="batch-summary-stats"` (4-up stat row)
 *   - `data-slot="batch-summary-stat"`  (individual stat cell)
 *   - `data-slot="batch-summary-list"`  (per-file results list)
 */
export interface BatchSummaryProps {
  /** Celery batch_id — used to trigger ZIP download */
  batchId: string;
  /** Per-file final statuses from useBatch hook */
  files: BatchFileStatus[];
  /** Total number of files submitted */
  totalFiles: number;
  /** Total structures across all "done" files */
  totalStructures: number;
  /** Number of files that completed successfully */
  succeededCount: number;
  /** Number of files that failed */
  failedCount: number;
  /** Called when user clicks "View" on a done file — receives extraction DB id */
  onViewExtraction: (extractionId: number) => void;
  /** Called when user wants to reset and start a new batch */
  onReset: () => void;
}

type StatTone = "default" | "secondary" | "destructive";

function StatItem({
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
      data-slot="batch-summary-stat"
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

export function BatchSummary({
  batchId,
  files,
  totalFiles,
  totalStructures,
  succeededCount,
  failedCount,
  onViewExtraction,
  onReset,
}: BatchSummaryProps) {
  async function handleDownloadZip() {
    try {
      await downloadBatchZip(batchId);
      toast.success("ZIP ready. Download started.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ZIP download failed.");
    }
  }

  return (
    <div data-slot="results-step" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-foreground">
          Batch complete
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            icon={<PlusIcon />}
          >
            New batch
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="rounded-full"
            onClick={handleDownloadZip}
            icon={<DownloadIcon />}
          >
            Download ZIP
          </Button>
        </div>
      </div>

      <dl
        data-slot="batch-summary-stats"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <StatItem label="Files" value={totalFiles} />
        <StatItem label="Structures" value={totalStructures} />
        <StatItem label="Succeeded" value={succeededCount} tone="secondary" />
        <StatItem
          label="Failed"
          value={failedCount}
          tone={failedCount > 0 ? "destructive" : "default"}
        />
      </dl>

      <ul
        data-slot="batch-summary-list"
        className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface"
      >
        {files.map((f) => (
          <li
            key={f.filename}
            data-slot="batch-summary-row"
            data-state={f.state}
            className="flex min-h-[48px] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted/40"
          >
            <span className="sr-only">
              {f.state === "done" ? "Succeeded" : "Failed"}
            </span>
            {f.state === "done" ? (
              <CheckCircle2Icon
                className="size-4 shrink-0 text-secondary"
                aria-hidden="true"
              />
            ) : (
              <XCircleIcon
                className="size-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
            )}
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
              {f.filename}
            </span>
            {f.state === "done" && (
              <span className="shrink-0 text-xs tabular-nums text-foreground-muted">
                {f.structureCount} structures
              </span>
            )}
            {f.state === "failed" && (
              <span className="max-w-[240px] shrink-0 truncate text-xs text-destructive">
                {f.error}
              </span>
            )}
            {f.state === "done" && f.extractionId != null && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => onViewExtraction(f.extractionId!)}
              >
                View
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
