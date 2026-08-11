/**
 * CdxViewerDialog — "View as drawn" trigger + dialog.
 *
 * Wires `useCdxRender` to the shared `CdxViewer` display widget behind a
 * base-ui `Dialog`. Opening the dialog kicks off the on-demand render of the
 * extraction's stored .cdx into a faithful whole-page SVG; closing it resets
 * the hook so a later re-open starts a fresh request rather than replaying
 * stale state.
 *
 * Reused verbatim on the fresh-extraction result (ExtractionSummary) and on
 * each history row (HistoryList) — the only per-call input is the numeric
 * extraction id.
 *
 * data-slot contract:
 *   data-slot="view-as-drawn"  (trigger button)
 */
import { useEffect, useState } from "react";
import { EyeIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CdxViewer } from "@/components/CdxViewer";
import { useCdxRender } from "@/hooks/useCdxRender";

export interface CdxViewerDialogProps {
  /** Extraction whose stored .cdx should be rendered faithfully. */
  extractionId: number;
  /**
   * Render the trigger as an icon-only button (no visible label) instead of
   * the default icon + text. Used in HistoryList rows, where the action
   * cell's CSS grid track must stay aligned with the header's fixed-width
   * "Actions" column — a wide icon+text trigger there desyncs every column
   * boundary against the header. The accessible name stays "View as drawn"
   * via `aria-label` either way. Defaults to false (icon + visible text),
   * used on the extraction-result trigger in ExtractionSummary, which has
   * room for the label.
   */
  iconOnly?: boolean;
}

export function CdxViewerDialog({ extractionId, iconOnly }: CdxViewerDialogProps) {
  const [open, setOpen] = useState(false);
  const { state, svg, errorCode, render, reset } = useCdxRender();

  // Generic (non-FILE_NOT_STORED) failures surface as a toast; FILE_NOT_STORED
  // gets its own inline message in the dialog body instead (handled below).
  useEffect(() => {
    if (state === "error" && errorCode !== "FILE_NOT_STORED") {
      toast.error("Could not render the original file.");
    }
  }, [state, errorCode]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      render(extractionId);
    } else {
      reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant={iconOnly ? "ghost" : "outline"}
            size={iconOnly ? "icon" : "sm"}
            aria-label="View as drawn"
            data-slot="view-as-drawn"
            className={iconOnly ? "text-foreground-muted hover:text-foreground" : undefined}
          />
        }
      >
        <EyeIcon className="size-4" />
        {!iconOnly && " View as drawn"}
      </DialogTrigger>
      <DialogContent size="lg" className="flex h-[85vh] w-[92vw] max-w-[95vw] flex-col">
        <DialogHeader>
          <DialogTitle>Original page (as drawn)</DialogTitle>
        </DialogHeader>

        {state === "loading" && (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        )}

        {state === "error" && errorCode === "FILE_NOT_STORED" && (
          <div className="flex flex-1 items-center justify-center text-sm text-foreground-muted">
            The original file was not stored for this extraction.
          </div>
        )}

        {state === "error" && errorCode !== "FILE_NOT_STORED" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-foreground-muted">
            <span data-slot="cdx-render-error">Couldn't render the original file.</span>
            <Button
              variant="outline"
              size="sm"
              data-slot="cdx-render-retry"
              onClick={() => render(extractionId)}
            >
              Try again
            </Button>
          </div>
        )}

        {state === "success" && svg && (
          <div className="min-h-0 flex-1">
            <CdxViewer svg={svg} title="Original drawing" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
