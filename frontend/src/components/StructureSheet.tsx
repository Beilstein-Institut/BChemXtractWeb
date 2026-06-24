/**
 * StructureSheet — side-panel detail view using shadcn Sheet.
 *
 * Replaces the Dialog-based StructureDetail for the browsing context.
 * Sheet stays open while browsing: only the substance prop changes,
 * not the open state.
 *
 * Keyboard shortcuts: ArrowLeft/Right scoped to when sheet is open.
 * SVG rendered via Blob URL — never as innerHTML.
 *
 * Security mitigations:
 * - SVG rendered via a Blob URL in <img src>, never innerHTML
 * - keydown listener added only when open===true, cleaned up on effect return
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CopyButton } from "@/components/internal/CopyButton";
import { ExportMenu } from "@/components/ExportMenu";
import { PubChemPanel } from "@/components/PubChemPanel";
import { usePubChemCompound } from "@/hooks/usePubChemEnrichment";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { postExport } from "@/lib/apiClient";
import { DEFAULT_DEPICTION } from "@/lib/depiction";
import { safeDownloadSlug } from "@/lib/safeStrings";
import type { Depiction, SubstanceResponse } from "@/types/chemistry";
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
  /**
   * Page-level 2D layout preference. Initializes the sheet's per-structure
   * CDK/ChemDraw toggle whenever the displayed substance changes; the user
   * can still override it locally for the structure on screen.
   */
  depiction?: Depiction;
}

/** Labeled metadata field + CopyButton, rendered inside the side-sheet. */
function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    // Mobile: label on its own line, then [copy][value] on the next line, so the
    // copy button sits at the start of the value (right under the title) and is
    // reachable without scrolling past a long InChI. Desktop: one row,
    // label | value | copy (order utilities reorder copy/value per breakpoint).
    <div className="flex flex-wrap items-start gap-x-2 gap-y-1 sm:flex-nowrap sm:justify-between">
      <span className="order-1 w-full text-micro font-semibold uppercase tracking-widest text-muted-foreground sm:w-auto sm:min-w-[120px] sm:shrink-0">
        {label}
      </span>
      <CopyButton value={value} label={label} className="order-2 shrink-0 sm:order-3" />
      <span className="order-3 min-w-0 flex-1 break-all font-mono text-caption text-foreground sm:order-2">
        {value}
      </span>
    </div>
  );
}

/**
 * StructureSheet — sheet-based full metadata panel for the browsing context.
 *
 * Keyboard ArrowLeft/Right navigation is scoped to when the sheet is open
 * (listener cleaned up when sheet closes).
 */
export function StructureSheet({
  open,
  onOpenChange,
  substance,
  substanceIndex,
  totalSubstances,
  onPrev,
  onNext,
  depiction = DEFAULT_DEPICTION,
}: StructureSheetProps) {
  const [zoom, setZoom] = useState(1);
  const [useCdxCoords, setUseCdxCoords] = useState(depiction === "cdx");
  // Tier-2 PubChem detail for the open structure. No-op (idle) until the user
  // opts in; null substance -> no fetch.
  const pubchem = usePubChemCompound(substance?.inchi_key);

  // Reset zoom and pick initial layout when substance changes. Follow the
  // page-level depiction preference (CDK by default); fall back to
  // the other layout when the preferred one isn't stored for this
  // structure. Computed once per substance change so there's only a
  // single commit (no cascading effects).
  // why: keying off `substance` to remount would break the Sheet
  //      animation and focus. Ephemeral UI state resets sync to the prop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prop-sync
    setZoom(1);

    setUseCdxCoords(
      substance
        ? depiction === "cdx"
          ? !!substance.svg_cdx
          : !substance.svg && !!substance.svg_cdx
        : depiction === "cdx",
    );
  }, [substance, depiction]);

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
        {
          format,
          substance_ids: [substance.id],
          // Export what this sheet is actually showing \u2014 the local
          // CDK/ChemDraw toggle wins over the page-level preference.
          depiction: useCdxCoords ? "cdx" : "cdk",
        },
        `${safeDownloadSlug(substance.inchi_key?.slice(0, 8))}_${format}.${FORMAT_EXT[format]}`,
      );
      toast.success("Export ready \u2014 downloading", { id: toastId, duration: 3000 });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "no reason returned";
      toast.error(`Export failed: ${reason}. Retry from the structure panel.`, { id: toastId });
    }
  }

  // Keyboard navigation scoped to when sheet is open
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

  // Render SVG via a Blob URL — never set innerHTML
  const activeSvg = useCdxCoords && substance?.svg_cdx ? substance.svg_cdx : substance?.svg;
  const svgSrc = useSvgObjectUrl(activeSvg);

  // Guard against "1 of 0" when totalSubstances is momentarily 0
  // during a page transition (new page substances array is briefly empty).
  const positionLabel = totalSubstances > 0 ? `${substanceIndex + 1} of ${totalSubstances}` : "";
  const isPrevDisabled = substanceIndex === 0;
  const isNextDisabled = substanceIndex === totalSubstances - 1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // Full-width on phones (minus a backdrop sliver), tapering to a
        // half-screen panel on desktop. Uses the data-[side=right]: prefix so
        // tailwind-merge overrides SheetContent's default w-3/4 / sm:max-w-sm.
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:max-w-none data-[side=right]:sm:max-w-none data-[side=right]:md:max-w-[80vw] data-[side=right]:lg:max-w-[50vw]"
        aria-label="Structure detail"
        showCloseButton={true}
      >
        <SheetHeader className="pb-2">
          {/* Navigation row: prev button + position indicator + next button */}
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous structure"
              onClick={onPrev}
              disabled={isPrevDisabled}
              className="rounded-full"
            >
              <ChevronLeftIcon className="size-5" />
            </Button>
            <span className="text-caption text-muted-foreground tabular-nums">{positionLabel}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next structure"
              onClick={onNext}
              disabled={isNextDisabled}
              className="rounded-full"
            >
              <ChevronRightIcon className="size-5" />
            </Button>
          </div>

          {/* Single-structure export */}
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
            {/* SVG display area: fixed-height with zoom controls. shrink-0 is
                load-bearing — SheetContent is a flex-col, and without it this
                box (whose content sets no min-height) collapses to ~0 to make
                room for the long metadata below, hiding the depiction and
                breaking the sheet's scroll. Mirrors ReactionSheet's flex-none. */}
            <div className="relative h-[42vh] sm:h-[50vh] shrink-0 bg-white rounded-xl border border-border mx-4 overflow-hidden">
              {svgSrc ? (
                <div className="w-full h-full overflow-auto flex items-center justify-center">
                  {/* key: fade in the swapped layout when CDK/ChemDraw flips. */}
                  <img
                    key={useCdxCoords ? "cdx" : "cdk"}
                    src={svgSrc}
                    alt={`${substance.molecular_formula} structure — full size`}
                    className="object-contain transition-transform duration-150 animate-in fade-in motion-reduce:animate-none"
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

              {/* Overlay controls — layout toggle + zoom share one bottom bar
                  so they keep proper spacing (justify-between) and wrap instead
                  of overlapping on narrow sheets. The toggle stays visible even
                  without an SVG so disabled states + tooltips can explain a
                  missing layout. */}
              <TooltipProvider>
                <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 bg-white/85 backdrop-blur-sm rounded-full px-2.5 py-1 ring-1 ring-black/10 shadow-sm">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            onClick={() => substance?.svg && setUseCdxCoords(false)}
                            disabled={!substance?.svg}
                            aria-pressed={!useCdxCoords}
                            className={`text-micro px-2.5 py-1 rounded-full transition-colors ${
                              !useCdxCoords && substance?.svg
                                ? "bg-primary text-white"
                                : "text-neutral-600 hover:text-neutral-900"
                            } disabled:opacity-50 disabled:hover:text-neutral-600 disabled:cursor-not-allowed`}
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
                            className={`text-micro px-2.5 py-1 rounded-full transition-colors ${
                              useCdxCoords && substance?.svg_cdx
                                ? "bg-primary text-white"
                                : "text-neutral-600 hover:text-neutral-900"
                            } disabled:opacity-50 disabled:hover:text-neutral-600 disabled:cursor-not-allowed`}
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

                  {/* Zoom controls — only meaningful when we have something to zoom. */}
                  {svgSrc && (
                    <div className="flex items-center gap-1.5 bg-white/85 backdrop-blur-sm rounded-full px-2.5 py-1 ring-1 ring-black/10 shadow-sm">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-neutral-600 hover:text-neutral-900"
                        aria-label="Zoom out"
                        onClick={zoomOut}
                        disabled={zoom <= 0.25}
                      >
                        <ZoomOutIcon className="size-4" />
                      </Button>
                      <button
                        className="text-micro text-neutral-600 tabular-nums min-w-[40px] text-center hover:text-neutral-900 transition-colors"
                        onClick={zoomReset}
                        aria-label="Reset zoom"
                      >
                        {Math.round(zoom * 100)}%
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-neutral-600 hover:text-neutral-900"
                        aria-label="Zoom in"
                        onClick={zoomIn}
                        disabled={zoom >= 5}
                      >
                        <ZoomInIcon className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </TooltipProvider>
            </div>

            {/* Metadata rows */}
            <div className="space-y-3 mt-4 px-4 pb-6">
              {substance.smiles && <MetadataRow label="SMILES" value={substance.smiles} />}
              {substance.inchi && <MetadataRow label="InChI" value={substance.inchi} />}
              {substance.inchi_key && <MetadataRow label="InChI Key" value={substance.inchi_key} />}
              {substance.molecular_formula && (
                <MetadataRow label="Formula" value={substance.molecular_formula} />
              )}
              {substance.mdlv3000 && <MetadataRow label="MDL V3000" value={substance.mdlv3000} />}
              {pubchem.state !== "idle" && (
                <div className="border-t border-border pt-3">
                  <PubChemPanel state={pubchem} smiles={substance.smiles} />
                </div>
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
