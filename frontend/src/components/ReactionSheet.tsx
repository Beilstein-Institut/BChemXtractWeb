/**
 * ReactionSheet — right-side detail panel for a single reaction, mirroring
 * StructureSheet. Renders prev/next navigation, zoomable reaction SVG,
 * all RInChI identifier variants, and per-component metadata grouped by
 * REACTANTS / PRODUCTS / AGENTS (empty groups suppressed).
 *
 * Keyboard shortcuts (scoped to when sheet is open):
 * - ArrowLeft  — previous reaction
 * - ArrowRight — next reaction
 * - + / =      — zoom in (clamped 0.25 → 5.0)
 * - -          — zoom out
 * - 0          — reset zoom to 1.0
 * - Escape     — close (handled by shadcn Sheet primitive default)
 *
 * SVG rendered as data URI in `<img src>` (T-10-05) — never innerHTML.
 */
import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { safeClipboardText } from "@/lib/safeStrings";
import type {
  ReactionComponentResponse,
  ReactionResponse,
} from "@/types/chemistry";

/**
 * CopyButton — copies `value` to the clipboard, flashing a check icon for
 * 2 seconds on success. Same pattern as StructureSheet.CopyButton.
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
      await navigator.clipboard.writeText(safeClipboardText(value));
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy \u2014 try selecting the text manually.");
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? "Copied!" : `Copy ${label} to clipboard`}
      onClick={handleCopy}
      className="shrink-0"
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-primary" aria-hidden="true" />
      ) : (
        <ClipboardIcon className="size-3.5" aria-hidden="true" />
      )}
    </Button>
  );
}

/**
 * MetadataRow — label + monospace value + copy button. Suppressed when
 * `value` is empty.
 */
function MetadataRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2 px-4 py-2">
      <span className="text-micro font-semibold text-muted-foreground uppercase tracking-widest min-w-[120px] shrink-0">
        {label}
      </span>
      <span className="text-caption text-foreground font-mono break-all flex-1">
        {value}
      </span>
      <CopyButton value={value} label={label.toLowerCase()} />
    </div>
  );
}

/**
 * ComponentBlock — a single reaction component (reactant / product / agent).
 * Suppressed entirely when both inchi and inchi_key are empty (D-13 allows
 * backend to return empty fields).
 */
function ComponentBlock({
  index,
  component,
}: {
  index: number;
  component: ReactionComponentResponse;
}) {
  if (!component.inchi && !component.inchi_key) return null;
  return (
    <div className="ml-4 pl-4 border-l border-border">
      <p className="text-micro text-muted-foreground mb-1 px-4">
        #{index + 1}
      </p>
      <MetadataRow label="InChI" value={component.inchi} />
      <MetadataRow label="InChI Key" value={component.inchi_key} />
    </div>
  );
}

/**
 * ComponentGroup — a named section (REACTANTS / PRODUCTS / AGENTS) with
 * a separator above. Suppressed when `components` is empty.
 */
function ComponentGroup({
  heading,
  components,
}: {
  heading: string;
  components: ReactionComponentResponse[];
}) {
  if (components.length === 0) return null;
  return (
    <>
      <Separator className="my-4" />
      <h3 className="text-micro font-semibold uppercase tracking-widest text-muted-foreground px-4 mb-2">
        {heading} ({components.length})
      </h3>
      <div className="space-y-3">
        {components.map((c, i) => (
          <ComponentBlock key={i} index={i} component={c} />
        ))}
      </div>
    </>
  );
}

export interface ReactionSheetProps {
  /** The reaction to display, or null to hide the sheet. */
  reaction: ReactionResponse | null;
  /** 0-based index within the current reactions list. */
  reactionIndex: number;
  /** Total number of reactions in the list (for "{N} of {M}" display). */
  totalCount: number;
  /** Sheet open state (mirrors StructureSheet). */
  open: boolean;
  /** Open-state change callback (handles Escape + backdrop close). */
  onOpenChange: (open: boolean) => void;
  /** Navigate to the previous reaction. */
  onPrev: () => void;
  /** Navigate to the next reaction. */
  onNext: () => void;
}

export function ReactionSheet({
  reaction,
  reactionIndex,
  totalCount,
  open,
  onOpenChange,
  onPrev,
  onNext,
}: ReactionSheetProps) {
  const [zoom, setZoom] = useState(1.0);

  // Keyboard shortcuts — scoped to open (cleaned up when sheet closes).
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNext();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoom((z) => Math.min(z + 0.25, 5));
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom((z) => Math.max(z - 0.25, 0.25));
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onPrev, onNext]);

  // Reset zoom when the displayed reaction changes.
  useEffect(() => {
    setZoom(1);
  }, [reactionIndex]);

  if (!reaction) return null;

  // T-10-05: SVG via encodeURIComponent data URI only — never innerHTML.
  const svgSrc = reaction.svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(reaction.svg)}`
    : null;

  const isPrevDisabled = reactionIndex <= 0;
  const isNextDisabled = reactionIndex >= totalCount - 1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto"
        style={{ maxWidth: "50vw", width: "50vw" }}
        aria-label="Reaction detail"
        showCloseButton={true}
      >
        <SheetHeader className="pb-2">
          {/* Navigation row: prev / position / next */}
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous reaction"
              disabled={isPrevDisabled}
              onClick={onPrev}
              className="rounded-full"
            >
              <ChevronLeftIcon className="size-5" aria-hidden="true" />
            </Button>
            <span
              aria-live="polite"
              className="text-caption text-muted-foreground tabular-nums"
            >
              Reaction {reactionIndex + 1} of {totalCount}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next reaction"
              disabled={isNextDisabled}
              onClick={onNext}
              className="rounded-full"
            >
              <ChevronRightIcon className="size-5" aria-hidden="true" />
            </Button>
          </div>

          <SheetTitle>
            Reaction {reactionIndex + 1} of {totalCount}
          </SheetTitle>
          <SheetDescription>Full reaction metadata</SheetDescription>
        </SheetHeader>

        {/* Reaction SVG with zoom controls */}
        <div className="relative h-[50vh] bg-background rounded-xl border border-border mx-4 overflow-hidden">
          {svgSrc ? (
            <div className="w-full h-full overflow-auto flex items-center justify-center">
              <img
                src={svgSrc}
                alt={`Reaction: ${reaction.reaction_smiles || "depiction"}`}
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
            <div className="flex h-full items-center justify-center text-caption text-muted-foreground">
              Depiction unavailable
            </div>
          )}

          {svgSrc && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-card/90 backdrop-blur-sm rounded-full px-2 py-1 ring-1 ring-foreground/10">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom out"
                onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
                disabled={zoom <= 0.25}
              >
                <ZoomOutIcon className="size-4" aria-hidden="true" />
              </Button>
              <button
                className="text-micro text-muted-foreground tabular-nums min-w-[40px] text-center hover:text-foreground transition-colors"
                onClick={() => setZoom(1)}
                aria-label="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom in"
                onClick={() => setZoom((z) => Math.min(z + 0.25, 5))}
                disabled={zoom >= 5}
              >
                <ZoomInIcon className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>

        {/* REACTION IDENTIFIERS */}
        <Separator className="my-4" />
        <h3 className="text-micro font-semibold uppercase tracking-widest text-muted-foreground px-4 mb-2">
          Reaction Identifiers
        </h3>
        <div className="space-y-0">
          <MetadataRow label="SMILES" value={reaction.reaction_smiles} />
          <MetadataRow label="RInChI" value={reaction.rinchi} />
          <MetadataRow
            label="RInChI Key (short)"
            value={reaction.short_rinchi_key}
          />
          <MetadataRow
            label="RInChI Key (long)"
            value={reaction.long_rinchi_key}
          />
          <MetadataRow
            label="RInChI Key (web)"
            value={reaction.web_rinchi_key}
          />
          <MetadataRow label="Aux Info" value={reaction.aux_info} />
        </div>

        {/* Component groups — each suppressed when empty */}
        <ComponentGroup heading="REACTANTS" components={reaction.reactants} />
        <ComponentGroup heading="PRODUCTS" components={reaction.products} />
        <ComponentGroup heading="AGENTS" components={reaction.agents} />

        <div className="pb-6" />
      </SheetContent>
    </Sheet>
  );
}
