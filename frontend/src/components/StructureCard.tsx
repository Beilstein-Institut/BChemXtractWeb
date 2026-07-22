/**
 * StructureCard — Liquid Glass tile.
 *
 * Flat surface card:
 *   - White sub-surface (rounded 12 px, min-h 160 px) holds the SVG depiction.
 *     The white sub-surface persists in dark mode — chemistry convention keeps
 *     structures on paper-white regardless of theme.
 *   - Metadata block below on the outer `--color-surface` card background:
 *       Name in Inter semibold 16 px — the IUPAC name when present, otherwise
 *       the molecular formula rendered with chemistry subscripts via <sub>.
 *       (The formula is shown only here; there is no separate formula row.)
 *       SMILES in Geist Mono 14 px, truncated with a native `title` tooltip
 *       for hover-reveal full.
 *   - SMILES row: truncated SMILES + Copy-SMILES icon button.
 *   - Bottom action row: PubChem status control (opens the compound, or
 *     searches PubChem for similar molecules when the structure is absent) +
 *     an optional "Locate on drawing" icon button (only when onLocate is set
 *     and the substance has occurrences) + a Details cue. Per-card export
 *     menu overlays the top-right corner.
 *
 * Hover: crimson ring (`ring-2 ring-primary/20`) + a 1.02 scale on the SVG
 * thumbnail (group-hover). No neomorphic lift.
 *
 * Behaviour preserved from the pre-rewrite version (downstream call sites
 * depend on this contract):
 *   - onOpen(itemIndex)   — sheet mode used by StructureBrowser.
 *   - isChecked / onSelect — selection checkbox overlay (batch flow).
 *   - default mode        — opens internal StructureDetail Dialog via Base UI.
 *   - ExportMenu overlay  — per-card export dropdown (top-right).
 *   - SVG rendered as Blob URL in <img src> (XSS mitigation).
 *
 * All new slots follow the `data-slot` contract:
 *   data-slot="structure-card"            (root)
 *   data-slot="structure-card-image"      (white PNG surface)
 *   data-slot="structure-card-name"       (Inter semibold title; IUPAC name,
 *                                          or the molecular formula with
 *                                          subscripts when no name is present)
 *   data-slot="structure-card-smiles"     (Geist Mono truncated)
 *   data-slot="structure-card-pubchem"    (PubChem status control, when enriched)
 *   data-slot="locate-on-drawing"         (locate button, when onLocate + occurrences)
 */
import { useState } from "react";
import { CrosshairIcon, FlaskConicalIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { CopyButton } from "@/components/internal/CopyButton";
import { ExportMenu } from "@/components/ExportMenu";
import { PubChemBadge } from "@/components/PubChemBadge";
import { StructureDetail } from "@/components/StructureDetail";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MolecularFormula } from "@/components/internal/MolecularFormula";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { postExport } from "@/lib/apiClient";
import { safeDownloadSlug } from "@/lib/safeStrings";
import { cn } from "@/lib/utils";
import { DEFAULT_DEPICTION, pickSvg } from "@/lib/depiction";
import type { Depiction, PubChemCardState, Rect, SubstanceResponse } from "@/types/chemistry";
import type { ExportFormat } from "@/types/export";
import type { SearchResult } from "@/types/search";
import { FORMAT_EXT } from "@/types/export";

export interface StructureCardAttribution {
  count: number;
  extractions: SearchResult["extractions"];
}

export interface StructureCardProps {
  /** Extracted substance data to display */
  substance: SubstanceResponse;
  /**
   * When provided, clicking the card calls onOpen(itemIndex) instead of
   * opening the internal Dialog. Internal Dialog is suppressed.
   * Used in StructureBrowser sheet mode.
   */
  onOpen?: (index: number) => void;
  /** Whether this card is currently selected (checkbox checked state). */
  isChecked?: boolean;
  /** Called when the checkbox is toggled. Receives substance.id. */
  onSelect?: (id: number) => void;
  /** 0-based index within the current page (passed back via onOpen). */
  itemIndex?: number;
  /** Extra classes merged into the root tile. */
  className?: string;
  /**
   * Optional attribution metadata threaded through to StructureDetail when the
   * card opens its internal dialog. Only meaningful in search-results context;
   * other call sites (StructureBrowser, BrowsePage) leave this undefined.
   */
  attribution?: StructureCardAttribution;
  /** Fired when the user picks an extraction from the in-dialog AttributionPill. */
  onViewExtraction?: (extractionId: number) => void;
  /**
   * Active 2D layout: fresh CDK layout ("cdk", default) or ChemDraw
   * original coordinates ("cdx"). Drives both the rendered thumbnail and the
   * image export payload so the download matches the display.
   */
  depiction?: Depiction;
  /**
   * Optional PubChem enrichment state for this structure. Supplied by the
   * parent grid (which batches lookups). Undefined when the user has not
   * opted in — the card then renders no PubChem chrome.
   */
  pubchem?: PubChemCardState;
  /** When set and the substance has occurrences, show a "locate on drawing"
   *  button that reports this substance's occurrence rects to the page. */
  onLocate?: (occurrences: Rect[]) => void;
}

/**
 * StructureCard — molecule grid tile.
 *
 * Implements the thumbnail card, molecular formula + SMILES, dialog trigger,
 * copy SMILES to clipboard, and batch selection. The rewrite flattens the
 * surface and introduces the white PNG sub-surface, Inter / Geist Mono
 * typography, and chemistry subscripts — existing behaviour (sheet mode,
 * export menu, detail dialog, XSS-safe Blob-URL SVG) is preserved.
 */
export function StructureCard({
  substance,
  onOpen,
  isChecked,
  onSelect,
  itemIndex,
  className,
  attribution,
  onViewExtraction,
  depiction = DEFAULT_DEPICTION,
  pubchem,
  onLocate,
}: StructureCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const svgSrc = useSvgObjectUrl(pickSvg(substance, depiction));

  // Headline: the IUPAC name when present, otherwise the molecular formula
  // (rendered with subscripts in the markup below). The formula is shown ONLY
  // in this headline — there is no separate formula row — so a card never
  // displays it twice.
  const trimmedIupac = substance.iupac_name?.trim() ?? "";
  const hasIupac = trimmedIupac.length > 0;

  async function handleExport(format: ExportFormat): Promise<void> {
    // Guard against sending substance_ids:[0] when id is falsy (Pydantic
    // default of 0 on SubstanceResponse.id). Backend returns 404 for id=0 which
    // shows a confusing "No substances found" error to the user.
    if (!substance.id) {
      toast.error(
        "Export needs a saved structure. Open the extraction first, then export from there.",
      );
      return;
    }
    const toastId = `export-card-${Date.now()}`;
    toast.loading("Preparing export\u2026", { id: toastId });
    try {
      await postExport(
        { format, substance_ids: [substance.id], depiction },
        `${safeDownloadSlug(substance.inchi_key?.slice(0, 8))}_${format}.${FORMAT_EXT[format]}`,
      );
      toast.success("Export ready \u2014 downloading", { id: toastId, duration: 3000 });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "no reason returned";
      toast.error(`Export failed: ${reason}. Retry from the structure panel.`, { id: toastId });
    }
  }

  /** Shared card inner content (SVG + metadata) used in both render modes. */
  const cardInner = (
    <div
      data-slot="structure-card"
      className={cn(
        "group relative overflow-hidden rounded-lg border border-border bg-surface",
        "transition-[box-shadow,transform] duration-200",
        "hover:ring-2 hover:ring-primary/20",
        isChecked && "ring-2 ring-primary",
        className,
      )}
    >
      {/* White sub-surface — structure depictions always render on white
          regardless of theme (chemistry convention). */}
      <div
        data-slot="structure-card-image"
        className="flex min-h-[140px] items-center justify-center rounded-md bg-white p-3 sm:min-h-[160px] sm:p-4"
      >
        {svgSrc ? (
          // key={depiction}: fade in the swapped layout (motion-reduce: none).
          <img
            key={depiction}
            src={svgSrc}
            alt={`${substance.molecular_formula} structure`}
            className="max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-[1.02] animate-in fade-in motion-reduce:animate-none"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <FlaskConicalIcon className="size-8 text-foreground-muted" />
          </div>
        )}
      </div>

      {/* Metadata block on the card surface. */}
      <div className="space-y-2 px-4 py-3 sm:px-5 sm:py-4">
        <h3
          data-slot="structure-card-name"
          className="font-sans text-base font-semibold leading-tight text-foreground line-clamp-2"
        >
          {hasIupac ? (
            trimmedIupac
          ) : substance.molecular_formula ? (
            <MolecularFormula value={substance.molecular_formula} />
          ) : (
            "Unnamed structure"
          )}
        </h3>

        <div className="flex items-center gap-2">
          <span
            data-slot="structure-card-smiles"
            className="min-w-0 flex-1 truncate font-mono text-sm text-foreground-muted"
            title={substance.smiles || ""}
          >
            {substance.smiles || "\u2014"}
          </span>
          <CopyButton value={substance.smiles} label="SMILES" stopPropagation mutedIcon />
        </div>

        {/* Action row: PubChem status control (opens the compound, or searches
            similar molecules when absent) on the left; the locate button sits
            on the right. The PubChem control is present only when the user has
            opted into enrichment. */}
        <div
          className={cn(
            "flex items-center gap-2",
            // The divider only earns its keep when the row has PubChem
            // content, so without it the row stays borderless — a card at
            // rest never shows an empty divided strip.
            pubchem && "border-t border-border pt-2",
          )}
        >
          {pubchem && (
            <div data-slot="structure-card-pubchem">
              <PubChemBadge state={pubchem} smiles={substance.smiles} />
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {onLocate && substance.occurrences && substance.occurrences.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="View this structure on the drawn file"
                        data-slot="locate-on-drawing"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLocate(substance.occurrences!);
                        }}
                      />
                    }
                  >
                    <CrosshairIcon className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent>View this structure on the drawn file</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Checkbox overlay — shown on hover when onOpen is provided, always visible when checked
  const checkboxOverlay = (onOpen !== undefined || isChecked) && (
    <div
      className={cn(
        "absolute top-2 left-2 z-10 transition-opacity",
        isChecked ? "opacity-100" : "opacity-0 group-hover:opacity-100",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <Checkbox
        checked={isChecked ?? false}
        onCheckedChange={() => onSelect?.(substance.id ?? 0)}
        aria-label={`Select ${substance.molecular_formula}`}
      />
    </div>
  );

  // Sheet mode: when onOpen is provided, suppress internal Dialog and call onOpen instead
  if (onOpen !== undefined) {
    return (
      <div className="relative group">
        {checkboxOverlay}
        {/* Per-card export icon overlay — top-2 right-2, mirrors checkbox at top-2 left-2 */}
        {/* stopPropagation on wrapper div covers the export trigger button and
            the icon itself — prevents card onClick firing when export area is clicked. */}
        <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
          <ExportMenu onExport={handleExport} triggerVariant="icon" align="start" />
        </div>
        <div
          role="button"
          tabIndex={0}
          aria-label={`View details for ${substance.molecular_formula}`}
          className="cursor-pointer"
          onClick={() => onOpen(itemIndex ?? 0)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              onOpen(itemIndex ?? 0);
            }
          }}
        >
          {cardInner}
        </div>
      </div>
    );
  }

  // Dialog mode: original behavior — clicking opens internal Dialog (backward-compatible)
  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger
        render={
          <div
            role="button"
            tabIndex={0}
            aria-label={`View details for ${substance.molecular_formula}`}
            className="cursor-pointer"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setIsDialogOpen(true);
              }
            }}
          />
        }
      >
        {cardInner}
      </DialogTrigger>

      {/* StructureDetail renders as DialogContent inside the Dialog */}
      <StructureDetail
        substance={substance}
        attribution={attribution}
        depiction={depiction}
        onViewExtraction={(id) => {
          setIsDialogOpen(false);
          onViewExtraction?.(id);
        }}
      />
    </Dialog>
  );
}
