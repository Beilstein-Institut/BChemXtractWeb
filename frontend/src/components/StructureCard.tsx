/**
 * StructureCard — a clickable molecule card showing SVG depiction, molecular
 * formula, truncated SMILES, and a clipboard copy button.
 *
 * Clicking the card body opens a StructureDetail dialog. Clicking the copy
 * button copies the SMILES string without opening the dialog (stopPropagation).
 *
 * SVG is rendered via a Blob URL in an <img> src — never as raw innerHTML —
 * to prevent XSS injection from backend-supplied SVG (T-04-04). See
 * useSvgObjectUrl for why Blob URLs replaced data URIs here.
 */
import { useState } from "react";
import { FlaskConicalIcon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyButton } from "@/components/internal/CopyButton";
import { ExportMenu } from "@/components/ExportMenu";
import { StructureDetail } from "@/components/StructureDetail";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { postExport } from "@/lib/apiClient";
import { safeDownloadSlug } from "@/lib/safeStrings";
import { cn } from "@/lib/utils";
import type { SubstanceResponse } from "@/types/chemistry";
import type { ExportFormat } from "@/types/export";
import { FORMAT_EXT } from "@/types/export";

export interface StructureCardProps {
  /** Extracted substance data to display */
  substance: SubstanceResponse;
  /**
   * When provided, clicking the card calls onOpen(itemIndex) instead of
   * opening the internal Dialog. Internal Dialog is suppressed.
   * Used in StructureBrowser sheet mode (D-07, D-10).
   */
  onOpen?: (index: number) => void;
  /** Whether this card is currently selected (checkbox checked state, D-16). */
  isChecked?: boolean;
  /** Called when the checkbox is toggled. Receives substance.id. */
  onSelect?: (id: number) => void;
  /** 0-based index within the current page (passed back via onOpen). */
  itemIndex?: number;
}

/**
 * StructureCard — molecule grid tile.
 *
 * Implements D-07 (thumbnail card), D-08 (molecular formula + SMILES), D-09
 * (dialog trigger), and DISP-04 (copy SMILES to clipboard).
 *
 * When `onOpen` prop is provided, clicks open a Sheet instead of the internal
 * Dialog (D-08, D-10). All existing usages without `onOpen` retain Dialog behavior.
 */
export function StructureCard({
  substance,
  onOpen,
  isChecked,
  onSelect,
  itemIndex,
}: StructureCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const svgSrc = useSvgObjectUrl(substance.svg);

  async function handleExport(format: ExportFormat): Promise<void> {
    // IN-02: guard against sending substance_ids:[0] when id is falsy (Pydantic
    // default of 0 on SubstanceResponse.id). Backend returns 404 for id=0 which
    // shows a confusing "No substances found" error to the user.
    if (!substance.id) {
      toast.error("Cannot export \u2014 structure has no database ID.");
      return;
    }
    const toastId = `export-card-${Date.now()}`;
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

  /** Shared card inner content (SVG + metadata) used in both render modes. */
  const cardInner = (
    <Card
      className={cn(
        "rounded-xl overflow-hidden bg-card ring-1 ring-foreground/10 transition-shadow hover:shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px] border-0",
        isChecked && "ring-primary"
      )}
    >
      {/* SVG container: 240px fixed height */}
      <div className="h-[240px] flex items-center justify-center bg-background rounded-t-xl p-4">
        {svgSrc ? (
          <img
            src={svgSrc}
            alt={`${substance.molecular_formula} structure`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full bg-muted rounded">
            <FlaskConicalIcon className="size-8 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Molecule metadata */}
      <CardContent className="space-y-2">
        <p className="text-caption font-normal tracking-[-0.016em] text-foreground">
          {substance.molecular_formula}
        </p>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="text-caption text-muted-foreground truncate max-w-[calc(100%-2rem)]" />
              }
            >
              {substance.smiles}
            </TooltipTrigger>
            <TooltipContent>{substance.smiles}</TooltipContent>
          </Tooltip>
          <CopyButton
            value={substance.smiles}
            label="SMILES"
            stopPropagation
            mutedIcon
          />
        </div>
      </CardContent>
    </Card>
  );

  // Checkbox overlay — shown on hover when onOpen is provided, always visible when checked (D-16)
  const checkboxOverlay = (onOpen !== undefined || isChecked) && (
    <div
      className={cn(
        "absolute top-2 left-2 z-10 transition-opacity",
        isChecked ? "opacity-100" : "opacity-0 group-hover:opacity-100"
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
        {/* Per-card export icon overlay (D-04) — top-2 right-2, mirrors checkbox at top-2 left-2 */}
        {/* WR-04: stopPropagation on wrapper div covers trigger button, its span wrapper,
            and the icon itself — prevents card onClick firing when export area is clicked. */}
        <div
          className="absolute top-2 right-2 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <ExportMenu
            onExport={handleExport}
            triggerVariant="icon"
            align="start"
          />
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
      <StructureDetail substance={substance} />
    </Dialog>
  );
}
