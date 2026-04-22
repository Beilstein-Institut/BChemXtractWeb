/**
 * BrowseBento — bento-grid landing for the Browse page (Phase 3 Task 11).
 *
 * Composition:
 *   ┌─────────────┬───────┬───────┐
 *   │ Recent       │ Total │ CTA   │   row 1  (Recent 2:2 · Total 1:1 · CTA 1:1)
 *   │ (2×2 hero)   ├───────┼───────┤
 *   │              │Unique │Format │   row 2  (Unique 1:1 · Format 1:1)
 *   ├──────────────┴───────┴───────┤
 *   │ Popular structures (4:1)      │   row 3  (Popular spans full width)
 *   └───────────────────────────────┘
 *
 * The design renders a 4-col grid at `lg:` and collapses gracefully
 * through 2-col (md) to 1-col (mobile) via BentoGrid's responsive
 * contract — every cell stacks vertically on small screens.
 *
 * Data shape: takes a pre-filtered `SubstanceResponse[]` (parent does
 * the filtering once; the bento + the StructureBrowser grid below
 * consume the same slice). "Recent" and "Popular" are approximations
 * since the backend doesn't expose those as dedicated endpoints:
 *   - Recent   → first 6 substances (extraction order)
 *   - Popular  → next 4 substances (a distinct slice so the same tile
 *                content doesn't appear twice)
 * Both fall back to the Recent slice when fewer than 10 substances are
 * present, clearly labelled "Featured" in the tile heading.
 */
import type { MouseEventHandler } from "react";
import { ArrowRightIcon, FlaskConicalIcon, LayoutGridIcon } from "lucide-react";

import { BentoGrid } from "@/components/layout/BentoGrid";
import { BentoCell } from "@/components/layout/BentoCell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { cn } from "@/lib/utils";
import type { SubstanceResponse } from "@/types/chemistry";

export interface BrowseBentoProps {
  /** Substance slice after `SearchFilter` filters are applied. */
  substances: readonly SubstanceResponse[];
  /** Raw, unfiltered count of substances in the extraction. */
  totalSubstances: number;
  /** ChemDraw format label, e.g. "cdxml". */
  format?: string;
  /** Called when the "Browse all" CTA is clicked. */
  onBrowseAll: () => void;
  /** Called when a hero / popular thumbnail is clicked. */
  onOpenSubstance?: (index: number) => void;
  className?: string;
}

/** Small white thumbnail reused across Recent + Popular tiles. */
function StructureThumb({
  substance,
  onClick,
  className,
}: {
  substance: SubstanceResponse;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
}) {
  const src = useSvgObjectUrl(substance.svg);
  const label =
    substance.iupac_name?.trim() ||
    substance.molecular_formula ||
    substance.inchi_key ||
    "structure";

  const content = (
    <>
      <div className="flex min-h-[96px] flex-1 items-center justify-center rounded-md bg-white p-3">
        {src ? (
          <img
            src={src}
            alt={`${label} structure`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <FlaskConicalIcon
            className="size-6 text-foreground-muted"
            aria-hidden="true"
          />
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

function RecentExtractionsTile({
  substances,
  totalFiltered,
  onOpenSubstance,
}: {
  substances: readonly SubstanceResponse[];
  totalFiltered: number;
  onOpenSubstance?: (index: number) => void;
}) {
  return (
    <Card
      data-slot="browse-bento-recent"
      className="flex h-full flex-col bg-surface"
    >
      <CardContent className="flex flex-1 flex-col gap-4">
        <header className="space-y-1">
          <p className="text-caption font-medium uppercase tracking-wide text-foreground-muted">
            Current extraction
          </p>
          <h2 className="font-display text-2xl font-semibold leading-tight text-foreground">
            Recent structures
          </h2>
          <p className="text-sm text-foreground-muted">
            {totalFiltered === 0
              ? "No structures match the current filters."
              : `Previewing ${Math.min(substances.length, totalFiltered)} of ${totalFiltered} matches.`}
          </p>
        </header>
        {substances.length > 0 ? (
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
            {substances.map((s, index) => (
              <StructureThumb
                key={s.id ?? `${s.inchi_key}-${index}`}
                substance={s}
                onClick={
                  onOpenSubstance ? () => onOpenSubstance(index) : undefined
                }
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
              <LayoutGridIcon
                className="mx-auto size-6 text-foreground-muted"
                aria-hidden="true"
              />
              <p className="text-sm text-foreground-muted">
                Adjust your search to see structures here.
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
  const toneClass =
    tone === "secondary" ? "text-secondary" : "text-primary";
  return (
    <Card
      data-slot="browse-bento-stat"
      data-tone={tone}
      className="flex h-full flex-col justify-between bg-surface"
    >
      <CardContent className="flex h-full flex-col justify-between gap-2">
        <p className={cn("font-display text-4xl font-semibold tabular-nums", toneClass)}>
          {value}
        </p>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          {hint && (
            <p className="mt-1 text-caption text-foreground-muted">{hint}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BrowseAllTile({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <Card
      data-slot="browse-bento-cta"
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
          <h2 className="font-display text-xl font-semibold leading-tight text-foreground">
            Browse all
          </h2>
          <p className="text-sm text-foreground-muted">
            Jump to the full paginated grid of {count.toLocaleString()}{" "}
            {count === 1 ? "structure" : "structures"}.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={onClick}
          data-slot="browse-bento-cta-button"
          className="self-start"
        >
          Open grid
          <ArrowRightIcon className="size-3.5" aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  );
}

function PopularStructuresTile({
  substances,
  onOpenSubstance,
  offset,
}: {
  substances: readonly SubstanceResponse[];
  onOpenSubstance?: (index: number) => void;
  /** Absolute index offset for onOpenSubstance callbacks. */
  offset: number;
}) {
  const label =
    substances.length > 0 ? "Featured structures" : "Featured structures";
  return (
    <Card
      data-slot="browse-bento-popular"
      className="flex h-full flex-col bg-surface"
    >
      <CardContent className="flex flex-1 flex-col gap-3">
        <header className="flex items-end justify-between gap-2">
          <div className="space-y-1">
            <p className="text-caption font-medium uppercase tracking-wide text-foreground-muted">
              A look inside
            </p>
            <h2 className="font-display text-xl font-semibold leading-tight text-foreground">
              {label}
            </h2>
          </div>
          <p className="text-caption text-foreground-muted">
            {substances.length} shown
          </p>
        </header>
        {substances.length > 0 ? (
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
            {substances.map((s, i) => (
              <StructureThumb
                key={s.id ?? `${s.inchi_key}-${i}`}
                substance={s}
                onClick={
                  onOpenSubstance
                    ? () => onOpenSubstance(offset + i)
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-1 items-center justify-center rounded-md border border-dashed border-border",
              "bg-surface-muted/50 p-4 text-center",
            )}
          >
            <p className="text-sm text-foreground-muted">
              More structures will appear here as the extraction grows.
            </p>
          </div>
        )}
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
  className,
}: BrowseBentoProps) {
  const recent = substances.slice(0, 6);
  // Popular slice starts after the hero so the same thumbnails don't
  // appear twice when the extraction has plenty of content. For smaller
  // extractions we fall back to the first 4 so the tile is never empty
  // when any matches exist.
  const popularStart = substances.length > 6 ? 6 : 0;
  const popular = substances.slice(popularStart, popularStart + 4);

  const filteredCount = substances.length;
  const uniqueInchiCount = new Set(
    substances
      .map((s) => s.inchi_key?.trim())
      .filter((key): key is string => !!key),
  ).size;

  return (
    <BentoGrid
      cols={4}
      className={cn("auto-rows-[minmax(160px,auto)]", className)}
      data-slot="browse-bento"
    >
      <BentoCell span="2:2" data-slot="browse-bento-cell-recent">
        <RecentExtractionsTile
          substances={recent}
          totalFiltered={filteredCount}
          onOpenSubstance={onOpenSubstance}
        />
      </BentoCell>

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

      <BentoCell span="1:1" data-slot="browse-bento-cell-cta">
        <BrowseAllTile count={filteredCount} onClick={onBrowseAll} />
      </BentoCell>

      <BentoCell span="1:1" data-slot="browse-bento-cell-unique">
        <StatTile
          label="Unique InChI keys"
          value={uniqueInchiCount.toLocaleString()}
          tone="secondary"
          hint="Deduplicated across the current view."
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

      <BentoCell span="4:1" data-slot="browse-bento-cell-popular">
        <PopularStructuresTile
          substances={popular}
          onOpenSubstance={onOpenSubstance}
          offset={popularStart}
        />
      </BentoCell>
    </BentoGrid>
  );
}
