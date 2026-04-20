/**
 * ReactionCard — a clickable full-width card showing the combined reaction
 * SVG, truncated reaction SMILES, short RInChI key, and a component summary
 * chip. Clicking the card body calls `onOpen(index)`; clicking the copy
 * buttons copies the underlying value and calls `e.stopPropagation()` so
 * the card-click does not fire.
 *
 * SVG is rendered as a URL-encoded data URI in `<img src>` — never as raw
 * innerHTML — to prevent XSS injection from backend-supplied SVG (T-10-05
 * mirrors Phase 4 T-04-04).
 */
import { useEffect, useRef, useState } from "react";
import { ArrowRightLeftIcon, CheckIcon, ClipboardIcon } from "lucide-react";
import { toast } from "sonner";
import { safeClipboardText } from "@/lib/safeStrings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ReactionResponse } from "@/types/chemistry";

/**
 * CopyButton — icon button that copies a value to the clipboard and flashes
 * a check icon for 2s. Mirrors the pattern in StructureSheet.tsx. Always
 * calls `e.stopPropagation()` so the enclosing card-click does not fire.
 */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
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
        <ClipboardIcon
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </Button>
  );
}

export interface ReactionCardProps {
  /** Extracted reaction data to display. */
  reaction: ReactionResponse;
  /** 0-based index within the current reactions list (passed back via onOpen). */
  reactionIndex: number;
  /** Called when the card body is clicked or Enter/Space is pressed. */
  onOpen: (index: number) => void;
  /** Whether this card is currently selected (e.g., sheet open on it). */
  isActive?: boolean;
}

/**
 * ReactionCard — full-width horizontal reaction tile for the Reactions tab.
 *
 * Implements UI-SPEC §4 (anatomy + responsive heights) and Plan 10 D-10
 * (card + side-sheet detail).
 */
export function ReactionCard({
  reaction,
  reactionIndex,
  onOpen,
  isActive = false,
}: ReactionCardProps) {
  // T-10-05: SVG via encodeURIComponent data URI only — never innerHTML.
  const svgSrc = reaction.svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(reaction.svg)}`
    : null;

  // D-10 component summary chip — "2 reactants · 1 products" with optional
  // "· N agent(s)" segment when agents.length > 0.
  const agentsSegment =
    reaction.agents.length > 0
      ? `${reaction.agents.length} agent${reaction.agents.length === 1 ? "" : "s"}`
      : null;
  const componentSummary = [
    `${reaction.reactants.length} reactants`,
    `${reaction.products.length} products`,
    agentsSegment,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");

  // Prefer the short key for display/copy; fall back to the (currently
  // unpopulated) rinchi_key for forward-compat.
  const displayedRinchiKey =
    reaction.short_rinchi_key || reaction.rinchi_key || "";

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`View reaction details \u2014 ${componentSummary}`}
      className={cn(
        "rounded-xl overflow-hidden bg-card ring-1 ring-foreground/10",
        "transition-shadow hover:shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px]",
        "border-0 cursor-pointer",
        isActive && "ring-primary",
      )}
      onClick={() => onOpen(reactionIndex)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(reactionIndex);
        }
      }}
    >
      {/* SVG container — responsive height per UI-SPEC §4 */}
      <div className="flex items-center justify-center bg-background rounded-t-xl p-6 h-[240px] md:h-[320px] lg:h-[400px]">
        {svgSrc ? (
          <img
            src={svgSrc}
            alt={`Reaction: ${reaction.reaction_smiles || "depiction"}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div
            className="flex flex-col items-center gap-2"
            aria-label="Reaction depiction unavailable"
          >
            <ArrowRightLeftIcon
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="text-caption text-muted-foreground">
              Depiction unavailable
            </span>
          </div>
        )}
      </div>

      <CardContent className="space-y-4 p-6">
        {/* SMILES row */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-micro font-semibold text-muted-foreground uppercase tracking-widest mb-1">
              SMILES
            </p>
            {reaction.reaction_smiles ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <p className="text-caption font-mono text-foreground truncate" />
                  }
                >
                  {reaction.reaction_smiles}
                </TooltipTrigger>
                <TooltipContent>{reaction.reaction_smiles}</TooltipContent>
              </Tooltip>
            ) : (
              <p className="text-caption font-mono text-foreground truncate">
                {"\u2014"}
              </p>
            )}
          </div>
          <CopyButton
            value={reaction.reaction_smiles}
            label="reaction SMILES"
          />
        </div>

        {/* Short RInChI key row */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-micro font-semibold text-muted-foreground uppercase tracking-widest mb-1">
              RInChI Key
            </p>
            <p className="text-caption font-mono text-foreground truncate">
              {displayedRinchiKey || "\u2014"}
            </p>
          </div>
          <CopyButton
            value={displayedRinchiKey}
            label="short RInChI key"
          />
        </div>

        {/* Summary row: component chip + view-details affordance */}
        <div className="flex items-center justify-between">
          <Badge
            variant="secondary"
            className="h-5 text-micro font-semibold gap-1"
          >
            {componentSummary}
          </Badge>
          <span className="text-caption text-muted-foreground hidden sm:inline">
            View details {"\u2192"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
