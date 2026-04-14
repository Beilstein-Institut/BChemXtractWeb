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
import { useEffect, useState, useRef } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CheckIcon,
  FlaskConicalIcon,
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
      <span className="text-caption font-semibold text-muted-foreground min-w-[120px] shrink-0">
        {label}
      </span>
      <span className="text-caption text-foreground break-all flex-1">{value}</span>
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
        className="w-full md:w-[480px] overflow-y-auto"
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
            >
              <ChevronRightIcon className="size-5" />
            </Button>
          </div>

          <SheetTitle className="text-sub-heading">
            {substance?.molecular_formula ?? "Structure"}
          </SheetTitle>
          <SheetDescription>Detailed structure metadata</SheetDescription>
        </SheetHeader>

        {substance ? (
          <>
            {/* SVG display area: 300px height (T-06-09: data URI only) */}
            <div className="h-[300px] bg-background rounded-lg p-4 flex items-center justify-center mx-4">
              {svgSrc ? (
                <img
                  src={svgSrc}
                  alt={`${substance.molecular_formula} structure — full size`}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full bg-muted rounded">
                  <FlaskConicalIcon className="size-12 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Metadata rows */}
            <div className="space-y-3 mt-4 px-4 pb-6">
              <MetadataRow label="SMILES" value={substance.smiles} />
              <MetadataRow label="InChI" value={substance.inchi} />
              <MetadataRow label="InChI Key" value={substance.inchi_key} />
              <MetadataRow
                label="Molecular Formula"
                value={substance.molecular_formula}
              />
              {/* MDL V3000 row only rendered when non-empty */}
              {substance.mdlv3000 && (
                <MetadataRow label="MDL V3000" value={substance.mdlv3000} />
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-[300px] mx-4 bg-muted rounded-lg">
            <FlaskConicalIcon className="size-12 text-muted-foreground" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
