import { useCallback, useRef, useState } from "react";
import { DownloadIcon, MaximizeIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { cn } from "@/lib/utils";
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

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  const zoomIn = () => setZoom((z) => clampZoom(z * STEP));
  const zoomOut = () => setZoom((z) => clampZoom(z / STEP));
  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => clampZoom(z * (e.deltaY < 0 ? STEP : 1 / STEP)));
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
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w.-]+/g, "_")}.svg`;
    a.click();
  };

  return (
    <div data-slot="cdx-viewer" className={cn("flex h-full flex-col gap-2", className)}>
      <div data-slot="cdx-toolbar" className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={zoomOut}>
          <ZoomOutIcon className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Fit / reset" onClick={reset}>
          <MaximizeIcon className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={zoomIn}>
          <ZoomInIcon className="size-4" />
        </Button>
        <span className="ml-1 text-xs text-foreground-muted tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" aria-label="Download SVG" className="ml-auto" onClick={download}>
          <DownloadIcon className="size-4" />
        </Button>
      </div>

      <div
        data-slot="cdx-viewport"
        data-testid="cdx-viewport"
        onWheel={onWheel}
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
            className="absolute left-1/2 top-1/2 max-w-none select-none"
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
