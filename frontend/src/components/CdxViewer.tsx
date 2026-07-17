import { useEffect, useRef, useState } from "react";
import { DownloadIcon, MaximizeIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerDownload } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";

export interface CdxViewerProps {
  /** Faithful whole-page SVG markup (already sanitized server-side). */
  svg: string;
  /** Accessible label / download base name. */
  title?: string;
  className?: string;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const STEP = 1.2;

/**
 * Self-contained viewer for a faithful ChemDraw SVG. Pure display: the caller
 * supplies the SVG string; the source (endpoint, upload, etc.) is irrelevant.
 * Renders via the app's <img blob> pattern (useSvgObjectUrl) — never
 * dangerouslySetInnerHTML.
 *
 * data-slot contract:
 *   data-slot="cdx-viewer"    (root)
 *   data-slot="cdx-toolbar"   (zoom/reset/download controls)
 *   data-slot="cdx-viewport"  (pan/zoom surface, also data-testid="cdx-viewport")
 */
export function CdxViewer({ svg, title = "ChemDraw structure", className }: CdxViewerProps) {
  const url = useSvgObjectUrl(svg);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  const stepZoom = (dir: 1 | -1) => setZoom((z) => clampZoom(dir > 0 ? z * STEP : z / STEP));
  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Mouse-wheel zoom needs a NON-passive listener: React 19 attaches its
  // synthetic `wheel` handler at the root as passive, so an onWheel prop's
  // e.preventDefault() is silently ignored (console warning + the page
  // scrolls while the image zooms). Wiring the DOM listener directly with
  // { passive: false } makes preventDefault effective. The handler computes
  // the clamp inline (closing only over the module-level MIN_ZOOM/MAX_ZOOM/
  // STEP constants and the stable setZoom setter) so it needs no dependency
  // array entries and the effect can run exactly once.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => {
        const next = e.deltaY < 0 ? z * STEP : z / STEP;
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      });
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const download = () => {
    // Reuse the shared download helper (appends the anchor to the document
    // before clicking — required by Firefox) rather than hand-rolling one.
    triggerDownload(
      new Blob([svg], { type: "image/svg+xml" }),
      `${title.replace(/[^\w.-]+/g, "_")}.svg`,
    );
  };

  return (
    <div data-slot="cdx-viewer" className={cn("flex h-full flex-col gap-2", className)}>
      <div data-slot="cdx-toolbar" className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => stepZoom(-1)}>
          <ZoomOutIcon className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Fit / reset" onClick={reset}>
          <MaximizeIcon className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => stepZoom(1)}>
          <ZoomInIcon className="size-4" />
        </Button>
        <span className="ml-1 text-xs text-foreground-muted tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Download SVG"
          className="ml-auto"
          onClick={download}
        >
          <DownloadIcon className="size-4" />
        </Button>
      </div>

      <div
        ref={viewportRef}
        data-slot="cdx-viewport"
        data-testid="cdx-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ ["--cdx-zoom" as string]: String(zoom) }}
        className={cn(
          "relative flex-1 overflow-hidden rounded-lg border border-border bg-white",
          "cursor-grab touch-none active:cursor-grabbing",
        )}
      >
        {url && (
          <img
            src={url}
            alt={title}
            draggable={false}
            // max-h/max-w-full (not max-w-none) makes the structure fit-to-fill
            // the viewport at zoom=1 (contain), so a wide reaction fills the box
            // instead of sitting tiny at its natural pixel size; zoom scales from there.
            className="absolute left-1/2 top-1/2 max-h-full max-w-full select-none"
            style={{
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center",
            }}
          />
        )}
      </div>
    </div>
  );
}
