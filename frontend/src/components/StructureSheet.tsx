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
import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FlaskConicalIcon,
  Loader2Icon,
  SparklesIcon,
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
import { MolecularFormula } from "@/components/internal/MolecularFormula";
import { ExportMenu } from "@/components/ExportMenu";
import { PubChemPanel } from "@/components/PubChemPanel";
import { usePubChemCompound } from "@/hooks/usePubChemEnrichment";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { postComputeInchi, postExport } from "@/lib/apiClient";
import { DEFAULT_DEPICTION } from "@/lib/depiction";
import { safeDownloadSlug } from "@/lib/safeStrings";
import type { Depiction, InchiResult, SubstanceResponse } from "@/types/chemistry";
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
function MetadataRow({
  label,
  value,
  display,
}: {
  label: string;
  value: string;
  /** Optional formatted display node; the raw `value` still drives copy. */
  display?: ReactNode;
}) {
  return (
    // Layout: the label heading on its own line, then the value stacked beneath
    // it with the copy button immediately before the value (SMILES/InChI/…) —
    // long strings get the full panel width instead of a squeezed column.
    <div className="flex flex-col gap-1">
      <span className="text-micro font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="flex items-start gap-x-2">
        {/* No value to copy (e.g. the Generate-InChI action row) -> no button. */}
        {value && <CopyButton value={value} label={label} className="shrink-0" />}
        <span className="min-w-0 flex-1 break-all font-mono text-caption text-foreground">
          {display ?? value}
        </span>
      </div>
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
  // On-demand InChI: when a structure's InChI was skipped at extraction time
  // (huge molecule), the user can compute it here. Holds the result for the
  // currently-shown substance; reset whenever the substance changes.
  const [computedInchi, setComputedInchi] = useState<InchiResult | null>(null);
  const [inchiLoading, setInchiLoading] = useState(false);

  // Effective InChI / InChIKey: prefer the stored values, fall back to a value
  // computed on demand. The stored InChIKey is only trustworthy when a real
  // InChI exists — without one it is a SMILES-hash surrogate (prefix "S"), so
  // we treat both as absent and offer the Generate action instead.
  const effectiveInchi = substance?.inchi || computedInchi?.inchi || "";
  const effectiveInchiKey = substance?.inchi
    ? substance.inchi_key
    : (computedInchi?.inchi_key ?? "");

  // PubChem is keyed on the REAL InChIKey (stored, or just generated) — never
  // the surrogate. A surrogate key 422s the lookup and surfaces a misleading
  // "PubChem unavailable" error; an empty key keeps the hook idle (panel
  // hidden) until the user generates a real one. So clicking "Generate InChI"
  // computes the real key, which automatically drives the PubChem lookup.
  const pubchem = usePubChemCompound(effectiveInchiKey || undefined);

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
    // Drop any on-demand InChI from the previously-shown substance.
    setComputedInchi(null);
    setInchiLoading(false);

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

  async function handleGenerateInchi(): Promise<void> {
    if (!substance?.smiles || inchiLoading) return;
    setInchiLoading(true);
    const toastId = `inchi-${Date.now()}`;
    toast.loading("Generating InChI…", { id: toastId });
    try {
      const result = await postComputeInchi(substance.smiles);
      // Setting the computed key makes effectiveInchiKey real, which auto-fires
      // the PubChem lookup (the panel keys on it) — no separate user action.
      setComputedInchi(result);
      toast.success("InChI generated", { id: toastId, duration: 2000 });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "no reason returned";
      toast.error(`Couldn't generate InChI: ${reason}`, { id: toastId });
    } finally {
      setInchiLoading(false);
    }
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
            <MolecularFormula value={substance?.molecular_formula} fallback="Structure" />
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
              {/* InChI / InChI Key shown only when a REAL InChI exists (stored
                  or generated on demand). Without it the stored key is a
                  SMILES-hash surrogate, so we hide both and offer Generate. */}
              {effectiveInchi ? (
                <>
                  <MetadataRow label="InChI" value={effectiveInchi} />
                  {effectiveInchiKey && <MetadataRow label="InChI Key" value={effectiveInchiKey} />}
                </>
              ) : (
                substance.smiles && (
                  // Reuse MetadataRow (empty value -> no copy button) so the
                  // label column stays aligned with the other rows.
                  <MetadataRow
                    label="InChI"
                    value=""
                    display={
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGenerateInchi}
                          disabled={inchiLoading}
                          className="w-fit gap-1.5"
                        >
                          {inchiLoading ? (
                            <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <SparklesIcon className="size-3.5" aria-hidden="true" />
                          )}
                          {inchiLoading ? "Generating…" : "Generate InChI"}
                        </Button>
                        <span className="text-micro text-muted-foreground">
                          Not computed during extraction — generate it from the SMILES.
                        </span>
                      </div>
                    }
                  />
                )
              )}
              {substance.molecular_formula && (
                <MetadataRow
                  label="Molecular Formula"
                  value={substance.molecular_formula}
                  display={<MolecularFormula value={substance.molecular_formula} />}
                />
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
