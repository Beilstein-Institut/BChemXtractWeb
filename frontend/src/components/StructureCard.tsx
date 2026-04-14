/**
 * StructureCard — a clickable molecule card showing SVG depiction, molecular
 * formula, truncated SMILES, and a clipboard copy button.
 *
 * Clicking the card body opens a StructureDetail dialog. Clicking the copy
 * button copies the SMILES string without opening the dialog (stopPropagation).
 *
 * SVG is rendered as a URL-encoded data URI in an <img> src — never as raw
 * innerHTML — to prevent XSS injection from backend-supplied SVG (T-04-04).
 */
import { useState, useRef, useEffect } from "react";
import { ClipboardIcon, CheckIcon, FlaskConicalIcon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { StructureDetail } from "@/components/StructureDetail";
import type { SubstanceResponse } from "@/types/chemistry";

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
  const [isCopied, setIsCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending copy-reset timer on unmount to avoid setState on
  // an unmounted component (WR-01).
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // URL-encode the SVG so it can be safely used as an img src attribute value.
  // This is the only approved rendering method per UI-SPEC.md (T-04-04).
  const svgSrc = substance.svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(substance.svg)}`
    : null;

  /**
   * Copy the SMILES string to the clipboard.
   * Calls e.stopPropagation() to prevent the card-click action from firing.
   */
  async function handleCopySmiles(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(substance.smiles);
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      setIsCopied(true);
      copyTimerRef.current = setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("Failed to copy — try selecting the text manually.");
    }
  }

  /** Shared card inner content (SVG + metadata) used in both render modes. */
  const cardInner = (
    <Card
      className={cn(
        "hover:shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px] transition-shadow duration-200 border-0 overflow-hidden",
        isChecked && "ring-1 ring-primary"
      )}
    >
      {/* SVG container: 240px fixed height */}
      <div className="h-[240px] flex items-center justify-center bg-background rounded-t-lg p-4">
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
        <p className="text-caption font-semibold text-foreground">
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
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={isCopied ? "Copied!" : "Copy SMILES to clipboard"}
            onClick={handleCopySmiles}
          >
            {isCopied ? (
              <CheckIcon className="size-3.5 text-primary" />
            ) : (
              <ClipboardIcon className="size-3.5 text-muted-foreground" />
            )}
          </Button>
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
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(substance.id ?? 0);
      }}
    >
      <Checkbox
        checked={isChecked ?? false}
        aria-label={`Select ${substance.molecular_formula}`}
      />
    </div>
  );

  // Sheet mode: when onOpen is provided, suppress internal Dialog and call onOpen instead
  if (onOpen !== undefined) {
    return (
      <div className="relative group">
        {checkboxOverlay}
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
