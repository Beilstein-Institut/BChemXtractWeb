import { useEffect, useMemo, useRef, useState } from "react";
import { DownloadIcon, MaximizeIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerDownload } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { cdxRectToSvg, parseCdxTransform } from "@/lib/cdxTransform";
import type { Rect } from "@/types/chemistry";

export interface CdxViewerProps {
  /** Faithful whole-page SVG markup (already sanitized server-side). */
  svg: string;
  /** Accessible label / download base name. */
  title?: string;
  className?: string;
  /** CDX-space rects to highlight over the drawing (mapped via the stamped transform). */
  highlights?: Rect[];
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
export function CdxViewer({
  svg,
  title = "ChemDraw structure",
  className,
  highlights,
}: CdxViewerProps) {
  const url = useSvgObjectUrl(svg);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // The highlight overlay rides the same viewBox/transform as the <img> so
  // it stays pixel-locked to the rendered structure at any zoom/pan.
  const transform = useMemo(() => parseCdxTransform(svg), [svg]);
  const viewBox = useMemo(() => svg.match(/viewBox="0 0 (\d+) (\d+)"/), [svg]);
  const overlayRects = useMemo(
    () => (highlights && transform ? highlights.map((r) => cdxRectToSvg(r, transform)) : []),
    [highlights, transform],
  );

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
        {overlayRects.length > 0 && viewBox && (
          <svg
            data-slot="cdx-highlight-overlay"
            viewBox={`0 0 ${viewBox[1]} ${viewBox[2]}`}
            // Explicit width/height give this inline <svg> the same intrinsic
            // pixel size as the sibling <img> (which sizes from the blob's
            // natural dimensions). Without them, a viewBox-only <svg> sizes
            // via CSS replaced-element rules instead, so it can render at a
            // different size/offset than the <img> and the highlight rects
            // drift off the structure.
            width={Number(viewBox[1])}
            height={Number(viewBox[2])}
            className="pointer-events-none absolute left-1/2 top-1/2 max-h-full max-w-full"
            style={{
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center",
            }}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            {overlayRects.map((r, i) => (
              <rect
                key={i}
                x={r.x}
                y={r.y}
                width={r.width}
                height={r.height}
                fill="var(--color-primary, magenta)"
                fillOpacity="0.18"
                stroke="var(--color-primary, magenta)"
                strokeWidth={Math.max(2 / zoom, 1)}
                rx={4}
              />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}
