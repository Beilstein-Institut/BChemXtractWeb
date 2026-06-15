/**
 * BrowseBento — bento-grid landing for the Browse page.
 *
 * Composition — one band at `lg:` (6 columns, 2 rows):
 *   ┌──────────────────────────────┬───────┬───────┐
 *   │ Preview (4:2)                 │ Total │Format │
 *   │                               ├───────┼───────┤
 *   │                               │Unique │  CTA  │
 *   └──────────────────────────────┴───────┴───────┘
 * The hero preview takes 2/3 of the band so the structure thumbnails
 * render wide enough to read; the four small tiles form two columns of
 * near-square cells (counts stacked on the left, format + CTA on the
 * right). The accented "Browse all" CTA sits bottom-right so the
 * reading order ends on the action. Collapses through 2-col (md) to
 * 1-col (mobile) via BentoGrid's responsive contract — spans are
 * ignored and every cell stacks on small screens.
 *
 * Data shape: takes a pre-filtered `SubstanceResponse[]` (parent does
 * the filtering once; the bento + the StructureBrowser grid below
 * consume the same slice). The hero tile previews substances in
 * extraction order — the backend exposes no recency or popularity
 * signal, so the copy says "preview", not "recent". When more than 5
 * structures are present, the preview trims to 3 thumbnails (one clean
 * row); at 5 or fewer, it shows them all. A former "Featured
 * structures" strip (substances 7–10) was removed: it carried no
 * signal and duplicated the full browser below.
 */
import type { MouseEventHandler } from "react";
import { CompassIcon, FlaskConicalIcon, LayoutGridIcon } from "lucide-react";

import { BentoGrid } from "@/components/layout/BentoGrid";
import { BentoCell } from "@/components/layout/BentoCell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { cn } from "@/lib/utils";
import { DEFAULT_DEPICTION, pickSvg } from "@/lib/depiction";
import type { Depiction, SubstanceResponse } from "@/types/chemistry";

export interface BrowseBentoProps {
  /** Substance slice after `SearchFilter` filters are applied. */
  substances: readonly SubstanceResponse[];
  /** Raw, unfiltered count of substances in the extraction. */
  totalSubstances: number;
  /** ChemDraw format label, e.g. "cdxml". */
  format?: string;
  /** Called when the "Browse all" CTA is clicked. */
  onBrowseAll: () => void;
  /** Called when a preview thumbnail is clicked. */
  onOpenSubstance?: (index: number) => void;
  /** Active 2D layout for thumbnails (ChemDraw "cdx" default / CDK "cdk"). */
  depiction?: Depiction;
  className?: string;
}

/** Small white thumbnail used in the preview tile. */
function StructureThumb({
  substance,
  onClick,
  depiction,
  className,
}: {
  substance: SubstanceResponse;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  depiction: Depiction;
  className?: string;
}) {
  const src = useSvgObjectUrl(pickSvg(substance, depiction));
  const label =
    substance.iupac_name?.trim() ||
    substance.molecular_formula ||
    substance.inchi_key ||
    "structure";

  const content = (
    <>
      <div className="flex min-h-[96px] flex-1 items-center justify-center rounded-md bg-white p-3">
        {src ? (
          // key={depiction}: remount on layout switch so the new render
          // fades in instead of snapping (motion-reduce disables it).
          <img
            key={depiction}
            src={src}
            alt={`${label} structure`}
            className="max-h-full max-w-full object-contain animate-in fade-in duration-200 motion-reduce:animate-none"
          />
        ) : (
          <FlaskConicalIcon className="size-6 text-foreground-muted" aria-hidden="true" />
        )}
      </div>
      <p className="mt-2 line-clamp-1 text-caption font-medium text-foreground">
        {substance.molecular_formula || "—"}
      </p>
    </>
  );

  if (!onClick) {
    return (
      <div
        data-slot="browse-bento-thumb"
        className={cn(
          "flex h-full flex-col rounded-md border border-border bg-surface-muted p-2",
          className,
        )}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-slot="browse-bento-thumb"
      aria-label={`Open details for ${label}`}
      className={cn(
        "group/thumb flex h-full flex-col rounded-md border border-border bg-surface-muted p-2 text-left transition-colors",
        "hover:border-primary/40 hover:bg-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {content}
    </button>
  );
}

/** Sub-line for the preview tile: filter-aware, honest about ordering. */
function previewCaption(shown: number, totalFiltered: number, totalUnfiltered: number): string {
  if (totalFiltered === 0) return "No structures match the current filters.";
  if (shown >= totalFiltered) {
    return totalFiltered === 1
      ? "Showing 1 structure."
      : `Showing all ${totalFiltered} structures.`;
  }
  const noun = totalFiltered === totalUnfiltered ? "structures" : "matches";
  return `Showing the first ${shown} of ${totalFiltered} ${noun}.`;
}

function StructurePreviewTile({
  substances,
  totalFiltered,
  totalUnfiltered,
  onOpenSubstance,
  depiction,
}: {
  substances: readonly SubstanceResponse[];
  totalFiltered: number;
  totalUnfiltered: number;
  onOpenSubstance?: (index: number) => void;
  depiction: Depiction;
}) {
  return (
    <Card data-slot="browse-bento-recent" className="flex h-full flex-col bg-surface">
      <CardContent className="flex flex-1 flex-col gap-4">
        <header className="space-y-1">
          <p className="text-caption font-medium uppercase tracking-wide text-foreground-muted">
            Current extraction
          </p>
          <h2 className="font-display text-2xl font-semibold leading-tight text-foreground">
            Structure preview
          </h2>
          <p className="text-sm text-foreground-muted">
            {previewCaption(substances.length, totalFiltered, totalUnfiltered)}
          </p>
        </header>
        {substances.length > 0 ? (
          <div className="grid flex-1 grid-cols-3 gap-3">
            {substances.map((s, index) => (
              // Composite key: fresh-upload envelopes return id 0 for every
              // substance, so `s.id ?? …` alone collides (0 is not nullish).
              <StructureThumb
                key={`${s.id}-${s.inchi_key}-${index}`}
                substance={s}
                depiction={depiction}
                onClick={onOpenSubstance ? () => onOpenSubstance(index) : undefined}
              />
            ))}
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-1 items-center justify-center rounded-md border border-dashed border-border",
              "bg-surface-muted/50 p-6 text-center",
            )}
          >
            <div className="space-y-1">
              <LayoutGridIcon className="mx-auto size-6 text-foreground-muted" aria-hidden="true" />
              <p className="text-sm text-foreground-muted">
                Adjust your search or filters to see structures here.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatTile({
  label,
  value,
  tone = "primary",
  hint,
}: {
  label: string;
  value: number | string;
  tone?: "primary" | "secondary";
  hint?: string;
}) {
  const toneClass = tone === "secondary" ? "text-secondary" : "text-primary";
  return (
    <Card
      data-slot="browse-bento-stat"
      data-tone={tone}
      size="sm"
      className="flex h-full flex-col justify-between bg-surface"
    >
      <CardContent className="flex h-full flex-col justify-between gap-2">
        <p className={cn("font-display text-4xl font-semibold tabular-nums", toneClass)}>{value}</p>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          {hint && <p className="mt-1 text-caption text-foreground-muted">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function BrowseAllTile({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Card
      data-slot="browse-bento-cta"
      size="sm"
      className={cn(
        "flex h-full flex-col justify-between",
        "bg-[color-mix(in_oklch,var(--color-primary)_12%,var(--color-surface))]",
      )}
    >
      <CardContent className="flex h-full flex-col justify-between gap-3">
        <div className="space-y-1">
          <p className="text-caption font-medium uppercase tracking-wide text-foreground-muted">
            Full list
          </p>
          <h2 className="font-display text-lg font-semibold leading-tight text-foreground">
            Browse all
          </h2>
          <p className="text-sm leading-snug text-foreground-muted">
            Jump to the full list of {count.toLocaleString()}{" "}
            {count === 1 ? "structure" : "structures"} below.
          </p>
        </div>
        {/* gap-1.5/px-2: at the 1024px band the square tile's content box
            is ~100px and the default padding clips the icon + label. */}
        <Button
          variant="primary"
          size="sm"
          onClick={onClick}
          data-slot="browse-bento-cta-button"
          className="w-full justify-center gap-1.5 px-2"
          icon={<CompassIcon />}
        >
          View all
        </Button>
      </CardContent>
    </Card>
  );
}

export function BrowseBento({
  substances,
  totalSubstances,
  format,
  onBrowseAll,
  onOpenSubstance,
  depiction = DEFAULT_DEPICTION,
  className,
}: BrowseBentoProps) {
  // Preview rule: more than 5 structures → trim to 3 thumbnails (one
  // clean row in the 3-col thumb grid); 5 or fewer → show them all.
  const preview = substances.slice(0, substances.length > 5 ? 3 : 5);

  const filteredCount = substances.length;
  const uniqueInchiCount = new Set(
    substances.map((s) => s.inchi_key?.trim()).filter((key): key is string => !!key),
  ).size;

  return (
    <BentoGrid
      cols={6}
      className={cn("auto-rows-[minmax(160px,auto)]", className)}
      data-slot="browse-bento"
    >
      <BentoCell span="4:2" data-slot="browse-bento-cell-recent">
        <StructurePreviewTile
          substances={preview}
          totalFiltered={filteredCount}
          totalUnfiltered={totalSubstances}
          onOpenSubstance={onOpenSubstance}
          depiction={depiction}
        />
      </BentoCell>

      {/* DOM order fills row-first: Total + Format on row 1, Unique +
          CTA on row 2 — so the two counts stack in the left square
          column and the CTA ends bottom-right. */}
      <BentoCell span="1:1" data-slot="browse-bento-cell-total">
        <StatTile
          label="Structures in view"
          value={filteredCount.toLocaleString()}
          hint={
            filteredCount === totalSubstances
              ? "All extracted structures."
              : `Filtered from ${totalSubstances.toLocaleString()} total.`
          }
        />
      </BentoCell>

      <BentoCell span="1:1" data-slot="browse-bento-cell-format">
        <StatTile
          label="Source format"
          value={format ? format.toUpperCase() : "—"}
          tone="secondary"
          hint="ChemDraw file type detected at upload."
        />
      </BentoCell>

      <BentoCell span="1:1" data-slot="browse-bento-cell-unique">
        <StatTile
          label="Unique InChI keys"
          value={uniqueInchiCount.toLocaleString()}
          tone="secondary"
          hint="Deduplicated across the current view."
        />
      </BentoCell>

      <BentoCell span="1:1" data-slot="browse-bento-cell-cta">
        <BrowseAllTile count={filteredCount} onClick={onBrowseAll} />
      </BentoCell>
    </BentoGrid>
  );
}
