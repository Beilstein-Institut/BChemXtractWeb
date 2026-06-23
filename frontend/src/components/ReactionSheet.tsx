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
 * SVG rendered via a Blob URL in `<img src>` — never innerHTML.
 */
import { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/internal/CopyButton";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import type { ReactionComponentResponse, ReactionResponse } from "@/types/chemistry";

/**
 * MetadataRow — label + monospace value + copy button. Suppressed when
 * `value` is empty.
 */
function MetadataRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1 px-4 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
      <span className="text-micro font-semibold text-muted-foreground uppercase tracking-widest min-w-[120px] shrink-0">
        {label}
      </span>
      <span className="text-caption text-foreground font-mono break-all flex-1">{value}</span>
      <CopyButton value={value} label={label.toLowerCase()} />
    </div>
  );
}

/**
 * ComponentBlock — a single reaction component (reactant / product / agent).
 * Suppressed entirely when both inchi and inchi_key are empty (the backend
 * may return empty fields).
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
      <p className="text-micro text-muted-foreground mb-1 px-4">#{index + 1}</p>
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

  function zoomIn() {
    setZoom((z) => Math.min(z + 0.25, 5));
  }
  function zoomOut() {
    setZoom((z) => Math.max(z - 0.25, 0.25));
  }
  function zoomReset() {
    setZoom(1);
  }

  // Keyboard shortcuts — scoped to open (cleaned up when sheet closes).
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

  // Reset zoom when the displayed reaction changes.
  // why: remounting via `key={reactionIndex}` would restart the Sheet
  //      open/close animation and break keyboard focus on prev/next.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prop-sync
    setZoom(1);
  }, [reactionIndex]);

  // SVG rendered via a Blob URL — never innerHTML. Hook must be
  // called before the early return so its order is stable across renders.
  const svgSrc = useSvgObjectUrl(reaction?.svg);

  if (!reaction) return null;

  const isPrevDisabled = reactionIndex <= 0;
  const isNextDisabled = reactionIndex >= totalCount - 1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // Full-width on phones (minus a backdrop sliver), tapering to a
        // half-screen panel on desktop. Uses the data-[side=right]: prefix so
        // tailwind-merge overrides SheetContent's default w-3/4 / sm:max-w-sm.
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:max-w-[calc(100vw-2rem)] data-[side=right]:sm:max-w-[90vw] data-[side=right]:md:max-w-[80vw] data-[side=right]:lg:max-w-[50vw]"
        aria-label="Reaction detail"
        showCloseButton={true}
      >
        <SheetHeader className="pb-2">
          {/* Navigation row: prev / position / next */}
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous reaction"
              disabled={isPrevDisabled}
              onClick={onPrev}
              className="rounded-full"
            >
              <ChevronLeftIcon className="size-5" aria-hidden="true" />
            </Button>
            <span aria-live="polite" className="text-caption text-muted-foreground tabular-nums">
              Reaction {reactionIndex + 1} of {totalCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
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

        {/* Reaction SVG with zoom controls.
         * flex-none + explicit height prevents the flex-col parent
         * (SheetContent) from shrinking this region — without it the
         * depiction collapses to near-zero when the metadata below
         * overflows. bg-white in both themes because CDK strokes are
         * hard black and need a light canvas for legibility; in dark
         * mode this reads as a paper tile. CDK's white backdrop rect
         * is stripped server-side so it doesn't double-paint. */}
        <div className="relative flex-none h-[280px] sm:h-[420px] md:h-[520px] bg-white rounded-xl border border-border mx-4 overflow-hidden">
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
                onClick={zoomOut}
                disabled={zoom <= 0.25}
              >
                <ZoomOutIcon className="size-4" aria-hidden="true" />
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
          <MetadataRow label="RInChI Key (short)" value={reaction.short_rinchi_key} />
          <MetadataRow label="RInChI Key (long)" value={reaction.long_rinchi_key} />
          <MetadataRow label="RInChI Key (web)" value={reaction.web_rinchi_key} />
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
