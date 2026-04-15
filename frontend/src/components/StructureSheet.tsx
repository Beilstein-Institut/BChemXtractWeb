/**
 * StructureSheet — side-panel detail view using shadcn Sheet.
 *
 * Replaces the Dialog-based StructureDetail for the browsing context (D-08).
 * Sheet stays open while browsing (D-10): only the substance prop changes,
 * not the open state.
 *
 * Keyboard shortcuts (D-18): ArrowLeft/Right scoped to when sheet is open.
 * SVG rendered as data URI (T-04-04 — never as innerHTML).
 *
 * STRIDE mitigations:
 * - T-06-09: SVG rendered as encodeURIComponent(svg) data URI in <img src>, never innerHTML
 * - T-06-10: keydown listener added only when open===true, cleaned up on effect return
 */
import { useEffect, useState, useRef, useCallback } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CheckIcon,
  FlaskConicalIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { SubstanceResponse } from "@/types/chemistry";

export interface StructureSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  substance: SubstanceResponse | null;
  /** 0-based index within the current page */
  substanceIndex: number;
  totalSubstances: number;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * CopyButton — icon button that copies a value to the clipboard and shows a
 * 2-second confirmation state. Same pattern as StructureDetail.tsx (WR-01).
 */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy — try selecting the text manually.");
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? "Copied!" : `Copy ${label} to clipboard`}
      onClick={handleCopy}
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-primary" />
      ) : (
        <ClipboardIcon className="size-3.5" />
      )}
    </Button>
  );
}

/**
 * MetadataRow — a labeled field with its value and a copy button.
 * Same pattern as StructureDetail.tsx.
 */
function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-micro font-semibold text-muted-foreground uppercase tracking-widest min-w-[120px] shrink-0">
        {label}
      </span>
      <span className="text-caption text-foreground font-mono break-all flex-1">{value}</span>
      <CopyButton value={value} label={label} />
    </div>
  );
}

/**
 * StructureSheet — sheet-based full metadata panel for the browsing context.
 *
 * Keyboard ArrowLeft/Right navigation is scoped to when the sheet is open
 * (T-06-10 mitigation — listener cleaned up when sheet closes).
 */
export function StructureSheet({
  open,
  onOpenChange,
  substance,
  substanceIndex,
  totalSubstances,
  onPrev,
  onNext,
}: StructureSheetProps) {
  const [zoom, setZoom] = useState(1);

  // Reset zoom when substance changes
  useEffect(() => {
    setZoom(1);
  }, [substance]);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 5)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.25)), []);
  const zoomReset = useCallback(() => setZoom(1), []);

  // Keyboard navigation scoped to when sheet is open (D-18, T-06-10)
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onNext();
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoom((z) => Math.min(z + 0.25, 5));
      }
      if (e.key === "-") {
        e.preventDefault();
        setZoom((z) => Math.max(z - 0.25, 0.25));
      }
      if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onPrev, onNext]);

  // URL-encode SVG as data URI — never set innerHTML (T-06-09)
  const svgSrc =
    substance?.svg
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(substance.svg)}`
      : null;

  const positionLabel = `${substanceIndex + 1} of ${totalSubstances}`;
  const isPrevDisabled = substanceIndex === 0;
  const isNextDisabled = substanceIndex === totalSubstances - 1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto"
        style={{ maxWidth: "50vw", width: "50vw" }}
        aria-label="Structure detail"
        showCloseButton={true}
      >
        <SheetHeader className="pb-2">
          {/* Navigation row: prev button + position indicator + next button */}
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous structure"
              onClick={onPrev}
              disabled={isPrevDisabled}
              className="rounded-full"
            >
              <ChevronLeftIcon className="size-5" />
            </Button>
            <span className="text-caption text-muted-foreground tabular-nums">
              {positionLabel}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next structure"
              onClick={onNext}
              disabled={isNextDisabled}
              className="rounded-full"
            >
              <ChevronRightIcon className="size-5" />
            </Button>
          </div>

          <SheetTitle className="text-sub-heading font-semibold tracking-tight">
            {substance?.molecular_formula ?? "Structure"}
          </SheetTitle>
          <SheetDescription>Detailed structure metadata</SheetDescription>
        </SheetHeader>

        {substance ? (
          <>
            {/* SVG display area: 50vh height with zoom controls */}
            <div className="relative h-[50vh] bg-background rounded-xl border border-border mx-4 overflow-hidden">
              {svgSrc ? (
                <div className="w-full h-full overflow-auto flex items-center justify-center">
                  <img
                    src={svgSrc}
                    alt={`${substance.molecular_formula} structure — full size`}
                    className="object-contain transition-transform duration-150"
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: "center center",
                      maxWidth: zoom <= 1 ? "100%" : "none",
                      maxHeight: zoom <= 1 ? "100%" : "none",
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center w-full h-full bg-muted rounded-xl">
                  <FlaskConicalIcon className="size-12 text-muted-foreground" />
                </div>
              )}

              {/* Zoom controls — bottom right of image area */}
              {svgSrc && (
                <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-card/90 backdrop-blur-sm rounded-full px-2 py-1 ring-1 ring-foreground/10">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Zoom out"
                    onClick={zoomOut}
                    disabled={zoom <= 0.25}
                  >
                    <ZoomOutIcon className="size-4" />
                  </Button>
                  <button
                    className="text-micro text-muted-foreground tabular-nums min-w-[40px] text-center hover:text-foreground transition-colors"
                    onClick={zoomReset}
                    aria-label="Reset zoom"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Zoom in"
                    onClick={zoomIn}
                    disabled={zoom >= 5}
                  >
                    <ZoomInIcon className="size-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Metadata rows */}
            <div className="space-y-3 mt-4 px-4 pb-6">
              {substance.smiles && (
                <MetadataRow label="SMILES" value={substance.smiles} />
              )}
              {substance.inchi && (
                <MetadataRow label="InChI" value={substance.inchi} />
              )}
              {substance.inchi_key && (
                <MetadataRow label="InChI Key" value={substance.inchi_key} />
              )}
              {substance.molecular_formula && (
                <MetadataRow
                  label="Formula"
                  value={substance.molecular_formula}
                />
              )}
              {substance.mdlv3000 && (
                <MetadataRow label="MDL V3000" value={substance.mdlv3000} />
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-[50vh] mx-4 bg-muted rounded-xl">
            <FlaskConicalIcon className="size-12 text-muted-foreground" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
