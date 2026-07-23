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
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CdxViewer } from "@/components/CdxViewer";
import { useCdxRender } from "@/hooks/useCdxRender";
import type { Rect } from "@/types/chemistry";

export interface CdxViewerInlineProps {
  /** Extraction whose stored .cdx should be rendered faithfully. */
  extractionId: number;
  /** Whether the panel is expanded. */
  open: boolean;
  /** DOM id of the panel region, matched by the trigger's `aria-controls`. */
  id?: string;
  /** CDX-space rects to highlight over the drawing, forwarded to CdxViewer. */
  highlights?: Rect[];
  /** Collapse the panel from within (close button); trigger stays in sync. */
  onClose?: () => void;
}

export function CdxViewerInline({
  extractionId,
  open,
  id,
  highlights,
  onClose,
}: CdxViewerInlineProps) {
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

  // Pin below the sticky AppHeader (--header-height) plus a 1rem gap so the
  // panel doesn't slide under it on scroll and hide the toolbar/close row.
  // z-20 sits under the header's z-40.
  return (
    <div
      id={id}
      data-slot="cdx-viewer-inline"
      className="relative sticky top-[calc(var(--header-height)_+_1rem)] z-20 mt-4 flex h-[45vh] flex-col overflow-hidden rounded-2xl border border-border bg-surface p-3 shadow-lg duration-300 animate-in fade-in slide-in-from-top-2 motion-reduce:animate-none"
    >
      {onClose && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close drawing"
          data-slot="cdx-viewer-close"
          // top-3/right-3 = panel p-3, so it sits on the toolbar's row rather
          // than floating above it. The X spins a quarter-turn on hover
          // (motion-safe only) — a small, earned close-button flourish.
          className="absolute right-3 top-3 z-10 [&_svg]:transition-transform [&_svg]:duration-200 motion-safe:hover:[&_svg]:rotate-90"
          onClick={onClose}
        >
          <XIcon className="size-4" />
        </Button>
      )}

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
          <CdxViewer svg={svg} title="Original ChemDraw" highlights={highlights} />
        </div>
      )}
    </div>
  );
}
