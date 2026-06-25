/**
 * BatchFilePreview — desktop hover popover for one batch file row.
 *
 * Wraps a row in a Base UI HoverCard (PreviewCard) that opens on pointer
 * hover / keyboard focus only — never on touch, so touch users keep the
 * row's "View" button. On first open it lazily fetches the file's full
 * detail (cached for the component's lifetime), then shows up to 4 SVG
 * thumbnails and a "View all N structures →" affordance.
 *
 * The `open`/`onOpenChange` props are an optional controlled pass-through
 * used exclusively in unit tests to drive open state without relying on
 * jsdom pointer-hover timer semantics. Production code never passes these
 * props — the card is fully hover-driven.
 */
import { useState, useEffect, useRef, type ReactElement } from "react";
import { ArrowRightIcon, FlaskConicalIcon } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { getHistoryDetail } from "@/lib/apiClient";
import { DEFAULT_DEPICTION, pickSvg } from "@/lib/depiction";
import type { SubstanceResponse } from "@/types/chemistry";

const PREVIEW_COUNT = 4;

function Thumb({ substance }: { substance: SubstanceResponse }) {
  const src = useSvgObjectUrl(pickSvg(substance, DEFAULT_DEPICTION));
  return (
    <div className="flex aspect-square items-center justify-center rounded-md bg-white p-1">
      {src ? (
        <img
          src={src}
          alt={substance.molecular_formula}
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <FlaskConicalIcon className="size-5 text-foreground-muted" aria-hidden="true" />
      )}
    </div>
  );
}

export interface BatchFilePreviewProps {
  extractionId: number;
  filename: string;
  structureCount: number;
  onViewExtraction: (id: number) => void;
  /**
   * The row element to wrap. It is rendered AS the hover-card trigger (Base UI
   * merges the trigger props onto it), so it must be a single element with a
   * real layout box — the popover anchors to its bounding rect.
   */
  children: ReactElement;
  /**
   * Controlled open state — only used by unit tests that need to drive open
   * state without relying on jsdom hover-timer behavior. Production callers
   * omit this prop; the card is uncontrolled and opens on pointer hover.
   */
  open?: boolean;
  /**
   * Controlled open-change callback — companion to `open`, test-only.
   */
  onOpenChange?: (open: boolean) => void;
}

export function BatchFilePreview({
  extractionId,
  filename,
  structureCount,
  onViewExtraction,
  children,
  open: controlledOpen,
  onOpenChange,
}: BatchFilePreviewProps) {
  /**
   * `thumbs === null`  → not yet loaded (show skeleton)
   * `thumbs === false` → fetch failed (show quiet error)
   * `thumbs` is array → loaded (show thumbnails)
   */
  const [thumbs, setThumbs] = useState<SubstanceResponse[] | false | null>(null);

  /**
   * Guards against double-fetching across re-renders and stale closures.
   * Set to `true` as soon as the first fetch starts; never reset for the
   * component's lifetime — the cache lives in `thumbs` state.
   */
  const fetchStartedRef = useRef(false);

  /**
   * Trigger a lazy fetch when the card opens for the first time.
   * Idempotent: the ref guard ensures only one network call is ever made,
   * regardless of how many times the card opens/closes (stale-closure-safe).
   */
  function maybeFetch() {
    if (fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    getHistoryDetail(extractionId)
      .then((d) => setThumbs(d.substances.slice(0, PREVIEW_COUNT)))
      .catch(() => setThumbs(false));
  }

  function handleOpenChange(isOpen: boolean) {
    onOpenChange?.(isOpen);
    if (isOpen) maybeFetch();
  }

  /**
   * Test path: when `controlledOpen` is driven to `true` by a rerender,
   * `onOpenChange` is NOT called by Base UI (it fires only on transitions
   * caused by user interaction). An effect watching `controlledOpen` picks
   * up the change and triggers the fetch so tests can open the card
   * imperatively via prop.
   */
  useEffect(() => {
    if (controlledOpen === true) maybeFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledOpen]);

  // Controlled props forwarded to HoverCard — test-only; production omits them.
  // Only `open` is included here; `onOpenChange` is already set directly on
  // HoverCard above so it must not be duplicated in the spread.
  const controlledProps = controlledOpen !== undefined ? { open: controlledOpen } : {};

  return (
    <HoverCard onOpenChange={handleOpenChange} {...controlledProps}>
      {/*
       * Render the row element itself AS the trigger. The trigger must have a
       * real layout box because Base UI's positioner anchors the popover to its
       * bounding rect — a `display: contents` wrapper has no box, so the popover
       * would anchor to (0,0) and jump to the top-left corner. Rendering the row
       * (a real <li>) keeps the popover anchored to the row and leaves the row's
       * own interactive buttons (the "View" button) fully clickable.
       *
       * Hover timing (`delay` = open, `closeDelay`) lives on the Trigger in
       * Base UI's PreviewCard — not the Root — so it is set here.
       */}
      <HoverCardTrigger delay={150} closeDelay={100} render={children} />
      <HoverCardContent className="w-72" aria-label={`Preview of ${filename}`}>
        {thumbs === false ? (
          <p className="text-caption text-foreground-muted">Preview unavailable.</p>
        ) : thumbs === null ? (
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: PREVIEW_COUNT }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-md" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {thumbs.map((s, i) => (
              <Thumb key={`${s.inchi_key || s.smiles || "x"}-${i}`} substance={s} />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => onViewExtraction(extractionId)}
          className="mt-2.5 inline-flex items-center gap-1 text-caption font-medium text-primary underline-offset-2 hover:underline"
        >
          View all {structureCount} structures
          <ArrowRightIcon className="size-3.5" aria-hidden="true" />
        </button>
      </HoverCardContent>
    </HoverCard>
  );
}
