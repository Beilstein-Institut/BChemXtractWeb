/**
 * SearchFilter — browse-page quick filter bar (Phase 3 Task 11).
 *
 * Compact glass composite that sits above the bento landing:
 *   - Free-text search inside a neomorphic pill (`--shadow-neu-inset`)
 *     so it echoes the AppHeader and command-palette inputs. Matches
 *     against molecular formula, SMILES, InChI key, and IUPAC name.
 *   - Three filter chips that narrow the current-extraction slice. The
 *     plan's original chip list (has-reaction / .cdx / .cdxml / date range)
 *     assumes a cross-extraction index — the per-extraction data surface
 *     does not expose those fields per substance, so chips are instead
 *     keyed on substance-shape predicates that ARE available:
 *       - "Has IUPAC name"  → substance.iupac_name non-empty
 *       - "SMILES available" → substance.smiles non-empty
 *       - "InChI available"  → substance.inchi non-empty
 *
 * Debounce: the free-text query runs through `useDebouncedValue(q, 250)`
 * so bento tile re-renders (hero grid + stats + popular strip) only
 * recalc after the user has paused typing for 250 ms.
 *
 * The `BrowseFilters` type + `EMPTY_FILTERS` constant live in
 * `./browse/browseFilters.ts` so this file only exports components
 * (satisfies `react-refresh/only-export-components`).
 *
 * Stable data hooks:
 *   data-slot="browse-search-filter"   (root)
 *   data-slot="browse-search-input"    (input wrapper)
 *   data-slot="filter-chip"            (each chip)
 *   data-active="true"                 (chip toggled on)
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EMPTY_FILTERS, type BrowseFilters } from "@/components/browse/browseFilters";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

// Call sites import `BrowseFilters` / `EMPTY_FILTERS` from
// `@/components/browse/browseFilters` directly — keeping them out of this
// file's exports preserves the `react-refresh/only-export-components`
// contract used across the Phase 3 primitives.

export interface SearchFilterProps {
  value: BrowseFilters;
  onChange: (next: BrowseFilters) => void;
  /** Debounce delay for the free-text query. Defaults to 250 ms. */
  debounceMs?: number;
  className?: string;
}

/**
 * Small pill-shaped toggle button matching Phase 3 token palette.
 * Uses `data-active` (not a Base UI `[data-checked]`) because this is a
 * plain toggle rather than a form primitive.
 */
function FilterChip({
  active,
  onToggle,
  children,
}: {
  active: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      data-slot="filter-chip"
      data-active={active ? "true" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        "border border-border bg-surface-muted text-foreground-muted",
        "hover:bg-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "data-[active=true]:bg-primary data-[active=true]:border-primary data-[active=true]:text-primary-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function SearchFilter({ value, onChange, debounceMs = 250, className }: SearchFilterProps) {
  // Locally owned input state — we only flush up to the parent after the
  // debounce window so the bento tiles don't recalc on every keystroke.
  const [q, setQ] = useState(value.q);
  const debouncedQ = useDebouncedValue(q, debounceMs);

  // Track the last value we flushed up so (a) we don't re-fire onChange
  // when the parent echoes the same query back, and (b) a reset from
  // the parent (Clear button handler below) snaps the local input back
  // to the parent's empty state without a circular effect.
  const lastFlushedRef = useRef<string>(value.q);

  // Sync external `value.q` changes into the local input (e.g. parent
  // clears filters programmatically — Task 14 share-link handling).
  // Guarded by `lastFlushedRef` so we don't ping-pong with the debounce
  // flush effect below.
  useEffect(() => {
    if (value.q !== lastFlushedRef.current) {
      lastFlushedRef.current = value.q;
      setQ(value.q);
    }
  }, [value.q]);

  useEffect(() => {
    if (debouncedQ !== lastFlushedRef.current) {
      lastFlushedRef.current = debouncedQ;
      onChange({ ...value, q: debouncedQ });
    }
    // `value` is read but should not retrigger — we only respond to the
    // debounced query changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  // Compute active state from the local input so the Clear button shows
  // immediately on typing rather than one debounce cycle late.
  const anyActive = q.trim() !== "" || value.hasName || value.hasSmiles || value.hasInchi;

  const handleClearAll = () => {
    lastFlushedRef.current = "";
    setQ("");
    onChange({ ...EMPTY_FILTERS });
  };

  return (
    <div
      data-slot="browse-search-filter"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3",
        className,
      )}
    >
      <div
        data-slot="browse-search-input"
        className={cn(
          "relative flex min-w-[240px] flex-1 items-center gap-2",
          "h-10 rounded-full bg-surface px-4",
          "shadow-[var(--shadow-neu-inset)]",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0",
        )}
      >
        <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-foreground-muted" />
        <input
          type="search"
          aria-label="Search structures in this extraction"
          placeholder="Search by formula, SMILES, InChI key, or IUPAC name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-slot="input"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none",
            "placeholder:text-foreground-muted",
          )}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={value.hasName}
          onToggle={() => onChange({ ...value, hasName: !value.hasName })}
        >
          Has IUPAC name
        </FilterChip>
        <FilterChip
          active={value.hasSmiles}
          onToggle={() => onChange({ ...value, hasSmiles: !value.hasSmiles })}
        >
          SMILES available
        </FilterChip>
        <FilterChip
          active={value.hasInchi}
          onToggle={() => onChange({ ...value, hasInchi: !value.hasInchi })}
        >
          InChI available
        </FilterChip>

        {anyActive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-foreground-muted"
            onClick={handleClearAll}
            aria-label="Clear all filters"
          >
            <XIcon className="size-3.5" aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
