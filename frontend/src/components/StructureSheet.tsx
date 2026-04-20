/**
 * StructureSheet — side-panel detail view using shadcn Sheet.
 *
 * Replaces the Dialog-based StructureDetail for the browsing context (D-08).
 * Sheet stays open while browsing (D-10): only the substance prop changes,
 * not the open state.
 *
 * Keyboard shortcuts (D-18): ArrowLeft/Right scoped to when sheet is open.
 * SVG rendered via Blob URL (T-04-04 — never as innerHTML).
 *
 * STRIDE mitigations:
 * - T-06-09: SVG rendered via a Blob URL in <img src>, never innerHTML
 * - T-06-10: keydown listener added only when open===true, cleaned up on effect return
 */
import { useEffect, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FlaskConicalIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyButton } from "@/components/internal/CopyButton";
import { ExportMenu } from "@/components/ExportMenu";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { postExport } from "@/lib/apiClient";
import { safeDownloadSlug } from "@/lib/safeStrings";
import type { SubstanceResponse } from "@/types/chemistry";
import type { ExportFormat } from "@/types/export";
import { FORMAT_EXT } from "@/types/export";

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

/** Labeled metadata field + CopyButton, rendered inside the side-sheet. */
function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-micro font-semibold text-muted-foreground uppercase tracking-widest min-w-[120px] shrink-0">
        {label}
      </span>
      <span className="text-caption text-foreground font-mono break-all flex-1">
        {value}
      </span>
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
  const [useCdxCoords, setUseCdxCoords] = useState(false);

  // Reset zoom and pick initial layout when substance changes. Default to CDK;
  // fall back to ChemDraw when CDK isn't available. Computed once per substance
  // change so there's only a single commit (no cascading effects).
  useEffect(() => {
    setZoom(1);
    setUseCdxCoords(substance ? !substance.svg && !!substance.svg_cdx : false);
  }, [substance]);

  function zoomIn() {
    setZoom((z) => Math.min(z + 0.25, 5));
  }
  function zoomOut() {
    setZoom((z) => Math.max(z - 0.25, 0.25));
  }
  function zoomReset() {
    setZoom(1);
  }

  async function handleExport(format: ExportFormat): Promise<void> {
    if (!substance?.id) return;
    const toastId = `export-sheet-${Date.now()}`;
    toast.loading("Preparing export\u2026", { id: toastId });
    try {
      await postExport(
        { format, substance_ids: [substance.id] },
        `${safeDownloadSlug(substance.inchi_key?.slice(0, 8))}_${format}.${FORMAT_EXT[format]}`
      );
      toast.success("Export ready \u2014 downloading", { id: toastId, duration: 3000 });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Export failed \u2014 ${reason}. Try again.`, { id: toastId });
    }
  }

  // Keyboard navigation scoped to when sheet is open (D-18, T-06-10)
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          onPrev();
          return;
        case "ArrowRight":
          e.preventDefault();
          onNext();
          return;
        case "+":
        case "=":
          e.preventDefault();
          zoomIn();
          return;
        case "-":
          e.preventDefault();
          zoomOut();
          return;
        case "0":
          e.preventDefault();
          zoomReset();
          return;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onPrev, onNext]);

  // Render SVG via a Blob URL — never set innerHTML (T-06-09)
  const activeSvg = useCdxCoords && substance?.svg_cdx ? substance.svg_cdx : substance?.svg;
  const svgSrc = useSvgObjectUrl(activeSvg);

  // WR-05: guard against "1 of 0" when totalSubstances is momentarily 0
  // during a page transition (new page substances array is briefly empty).
  const positionLabel =
    totalSubstances > 0 ? `${substanceIndex + 1} of ${totalSubstances}` : "";
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

          {/* Single-structure export (D-02) */}
          {substance && (
            <div className="flex justify-end mb-2">
              <ExportMenu
                onExport={handleExport}
                triggerLabel="Export"
                triggerVariant="label"
                align="end"
              />
            </div>
          )}

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

              {/* Layout toggle — always visible so users see disabled
                  states and tooltips explaining when a layout is missing. */}
              <div className="absolute bottom-3 left-3">
                <TooltipProvider>
                  <div className="flex items-center gap-1 bg-card/90 backdrop-blur-sm rounded-full px-2 py-1 ring-1 ring-foreground/10">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            onClick={() => substance?.svg && setUseCdxCoords(false)}
                            disabled={!substance?.svg}
                            aria-pressed={!useCdxCoords}
                            className={`text-micro px-2 py-0.5 rounded-full transition-colors ${
                              !useCdxCoords && substance?.svg
                                ? "bg-primary text-white"
                                : "text-muted-foreground hover:text-foreground"
                            } disabled:opacity-50 disabled:hover:text-muted-foreground disabled:cursor-not-allowed`}
                          >
                            CDK
                          </button>
                        }
                      />
                      <TooltipContent className="max-w-[280px]">
                        {substance?.svg
                          ? "Canonical 2D layout regenerated by the Chemistry Development Kit. Often cleaner for complex molecules \u2014 no crossing bonds, consistent spacing."
                          : "CDK layout unavailable \u2014 the coordinate generator could not lay out this structure."}
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            onClick={() => substance?.svg_cdx && setUseCdxCoords(true)}
                            disabled={!substance?.svg_cdx}
                            aria-pressed={useCdxCoords}
                            className={`text-micro px-2 py-0.5 rounded-full transition-colors ${
                              useCdxCoords && substance?.svg_cdx
                                ? "bg-primary text-white"
                                : "text-muted-foreground hover:text-foreground"
                            } disabled:opacity-50 disabled:hover:text-muted-foreground disabled:cursor-not-allowed`}
                          >
                            ChemDraw
                          </button>
                        }
                      />
                      <TooltipContent className="max-w-[280px]">
                        {substance?.svg_cdx
                          ? "Original 2D coordinates from the uploaded ChemDraw file. Matches the uploaded file."
                          : "Original coordinates unavailable for this structure."}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>

              {/* Zoom controls — only meaningful when we have something to zoom. */}
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
