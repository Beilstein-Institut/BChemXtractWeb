import { CircleSlashIcon, PlusIcon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * BatchStopped — terminal screen shown after a batch is cancelled.
 *
 * A stop is a clean stop: the backend deletes the batch's partial results, so
 * there's nothing to show. This panel confirms the stop and points the user at
 * a fresh start (reload, or a new batch without a full page reload).
 */
export interface BatchStoppedProps {
  /** Return to the upload step for a fresh batch (no page reload). */
  onReset: () => void;
}

export function BatchStopped({ onReset }: BatchStoppedProps) {
  return (
    <div
      data-slot="batch-stopped"
      className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface px-6 py-12 text-center"
    >
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-surface-muted">
        <CircleSlashIcon className="size-6 text-foreground-muted" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold text-foreground">Batch stopped</h2>
        <p className="max-w-[42ch] text-sm text-foreground-muted">
          Processing was cancelled and this batch&rsquo;s results were discarded. Reload the page to
          extract new structures.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="primary"
          size="sm"
          className="rounded-full"
          onClick={() => window.location.reload()}
          icon={<RotateCwIcon />}
        >
          Reload page
        </Button>
        <Button variant="ghost" size="sm" onClick={onReset} icon={<PlusIcon />}>
          New batch
        </Button>
      </div>
    </div>
  );
}
