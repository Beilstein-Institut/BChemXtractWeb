import {
  ClockIcon,
  LoaderIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
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
import type { BatchFileStatus } from "@/types/batch";

export interface BatchProgressProps {
  /** Per-file statuses from the useBatch hook */
  files: BatchFileStatus[];
  /** Number of files in state "done" or "failed" (i.e., fully processed) */
  completedCount: number;
  /** Total files in the batch */
  totalCount: number;
  /** Called when the user confirms batch cancellation */
  onCancel: () => void;
}

/**
 * BatchProgress — shows overall progress bar + per-file status list during
 * batch extraction (D-13). Replaces the drop zone while the batch is running.
 *
 * Accessibility: the per-file list uses aria-live="polite" so screen readers
 * announce status updates as files complete.
 */
export function BatchProgress({
  files,
  completedCount,
  totalCount,
  onCancel,
}: BatchProgressProps) {
  const progressValue =
    totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const progressPercent = Math.round(progressValue);

  return (
    <div className="py-10 space-y-6">
      {/* Top row: progress bar + cancel button */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Progress value={progressValue}>
            <ProgressLabel>
              {completedCount} of {totalCount} files
            </ProgressLabel>
            <ProgressValue>
              {() => `${progressPercent}%`}
            </ProgressValue>
          </Progress>
        </div>

        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive shrink-0 rounded-full"
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
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onCancel}
              >
                Stop batch
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Per-file status list */}
      <ul
        aria-live="polite"
        className="rounded-xl bg-card shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px] overflow-hidden divide-y divide-border"
      >
        {files.map((f) => (
          <li
            key={f.filename}
            className="min-h-[48px] flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
          >
            {/* Status icon */}
            {f.state === "queued" && (
              <ClockIcon size={16} className="text-muted-foreground shrink-0" />
            )}
            {f.state === "processing" && (
              <LoaderIcon
                size={16}
                className="text-primary animate-spin shrink-0"
              />
            )}
            {f.state === "done" && (
              <CheckCircle2Icon
                size={16}
                className="text-primary shrink-0"
              />
            )}
            {f.state === "failed" && (
              <XCircleIcon
                size={16}
                className="text-destructive shrink-0"
              />
            )}

            {/* Filename */}
            <span className="text-body text-foreground truncate flex-1">
              {f.filename}
            </span>

            {/* Right: result count or error */}
            {f.state === "done" && (
              <span className="text-micro text-muted-foreground shrink-0">
                {f.structureCount} structures
              </span>
            )}
            {f.state === "failed" && (
              <span
                className="text-micro text-destructive shrink-0 max-w-[200px] truncate"
                title={f.error}
              >
                {f.error.slice(0, 80)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
