import { DownloadIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { downloadBatchZip } from "@/lib/apiClient";
import type { BatchFileStatus } from "@/types/batch";

export interface BatchSummaryProps {
  /** Celery batch_id — used to trigger ZIP download */
  batchId: string;
  /** Per-file final statuses from useBatch hook */
  files: BatchFileStatus[];
  /** Total number of files submitted (may exceed files.length if some were not tracked) */
  totalFiles: number;
  /** Total structures across all "done" files */
  totalStructures: number;
  /** Number of files that completed successfully */
  succeededCount: number;
  /** Number of files that failed */
  failedCount: number;
  /** Called when user clicks "View" on a done file — receives the extraction DB id */
  onViewExtraction: (extractionId: number) => void;
  /** Called when user wants to reset and start a new batch */
  onReset: () => void;
}

/**
 * BatchSummary — post-completion summary card (D-17).
 *
 * All user-provided strings (filenames, error messages) are rendered as React
 * JSX text children. React escapes them automatically, preventing XSS (T-07-11).
 * No raw HTML injection is used anywhere in this component.
 */
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
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <span className="text-sub-heading font-semibold">Batch complete</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onReset}>
            New batch
          </Button>
          <Button variant="default" size="sm" onClick={handleDownloadZip}>
            <DownloadIcon size={14} className="mr-2" />
            Download ZIP
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stat row: 4-col desktop, 2-col mobile */}
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatItem label="Files" value={totalFiles} />
          <StatItem label="Structures" value={totalStructures} />
          <StatItem label="Succeeded" value={succeededCount} />
          <StatItem
            label="Failed"
            value={failedCount}
            valueClassName={failedCount > 0 ? "text-destructive" : undefined}
          />
        </dl>
        <Separator />
        {/* File results list — filenames and errors rendered as JSX text children only */}
        <ul className="space-y-2">
          {files.map((f) => (
            <li key={f.filename} className="flex items-center gap-3 min-h-[48px]">
              {f.state === "done" ? (
                <CheckCircle2Icon size={16} className="text-primary shrink-0" />
              ) : (
                <XCircleIcon size={16} className="text-destructive shrink-0" />
              )}
              <span className="text-body text-foreground truncate flex-1">
                {f.filename}
              </span>
              {f.state === "done" && (
                <span className="text-micro text-muted-foreground shrink-0">
                  {f.structureCount} structures
                </span>
              )}
              {f.state === "failed" && (
                <span className="text-micro text-destructive shrink-0 max-w-[200px] truncate">
                  {f.error}
                </span>
              )}
              {f.state === "done" && f.extractionId != null && (
                <button
                  onClick={() => onViewExtraction(f.extractionId!)}
                  className="text-[14px] text-primary underline-offset-2 hover:underline shrink-0"
                >
                  View
                </button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function StatItem({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className={cn("text-sub-heading font-semibold", valueClassName)}>
        {value}
      </dd>
    </div>
  );
}
