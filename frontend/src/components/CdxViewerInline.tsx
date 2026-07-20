/**
 * CdxViewerInline — "View as drawn" rendered inline instead of in a dialog.
 *
 * Same render pipeline as CdxViewerDialog (useCdxRender -> CdxViewer), but
 * displayed as a collapsible panel controlled by the caller's `open` flag.
 * The Browse page uses this to drop the faithful ChemDraw drawing in above
 * the Structures/Reactions tabs rather than opening a popup. The trigger
 * itself lives in the caller (the extraction card's "View as drawn" button),
 * which wires `aria-controls`/`aria-expanded` to this panel.
 *
 * Opening kicks off the on-demand render of the stored .cdx; closing resets
 * the hook so a re-open starts a fresh request rather than replaying stale
 * state (mirrors CdxViewerDialog's open/close semantics).
 */
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CdxViewer } from "@/components/CdxViewer";
import { useCdxRender } from "@/hooks/useCdxRender";

export interface CdxViewerInlineProps {
  /** Extraction whose stored .cdx should be rendered faithfully. */
  extractionId: number;
  /** Whether the panel is expanded. */
  open: boolean;
  /** DOM id of the panel region, matched by the trigger's `aria-controls`. */
  id?: string;
}

export function CdxViewerInline({ extractionId, open, id }: CdxViewerInlineProps) {
  const { state, svg, errorCode, render, reset } = useCdxRender();

  // Render when opened; reset when closed or when the extraction changes so a
  // prior file's drawing can't linger. render/reset are stable (useCallback).
  useEffect(() => {
    if (open) render(extractionId);
    else reset();
  }, [open, extractionId, render, reset]);

  // Generic (non-FILE_NOT_STORED) failures surface as a toast; FILE_NOT_STORED
  // gets its own inline message below — same split as CdxViewerDialog.
  useEffect(() => {
    if (state === "error" && errorCode !== "FILE_NOT_STORED") {
      toast.error("Could not render the original file.");
    }
  }, [state, errorCode]);

  if (!open) return null;

  return (
    <div
      id={id}
      data-slot="cdx-viewer-inline"
      className="mt-4 flex h-[60vh] flex-col overflow-hidden rounded-2xl border border-border bg-surface p-3 duration-300 animate-in fade-in slide-in-from-top-2 motion-reduce:animate-none"
    >
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
          <CdxViewer svg={svg} title="Original ChemDraw" />
        </div>
      )}
    </div>
  );
}
