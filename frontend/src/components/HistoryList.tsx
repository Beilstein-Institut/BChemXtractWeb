/**
 * HistoryList — Phase 3 Liquid Glass rebuild (Task 12).
 *
 * Re-skinned table-style list with:
 *   - Sticky glass toolbar: heading, debounced search box, CSV export.
 *   - Sticky column header row (uppercase captions, glass tint).
 *   - Zebra-striped rows (alt rows get `bg-surface-elevated`).
 *   - Click / keyboard-activate on a row to reload the extraction.
 *   - Per-row delete affordance tucked in a trailing column, with pointer
 *     events stopped so the click doesn't bubble up to the row navigation.
 *   - CSV export uses {@link useCSVExport} and respects the active
 *     filtered slice, so "Export CSV" emits exactly what the user sees.
 *
 * The list preserves the Phase 2 data contract — parent owns the fetch
 * via `useHistory` and passes `entries`, `total`, `loading`, plus the
 * reload / delete / show-all callbacks. Row navigation still flows
 * through `onReload` + `onReloadSuccess` (parent pushes the result into
 * the Browse page), which is the existing historical view pipeline.
 */

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import {
  ClockIcon,
  DownloadIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useCSVExport, type CSVColumn } from "@/hooks/useCSVExport";
import { cn } from "@/lib/utils";
import type { ExtractionResponse } from "@/types/chemistry";
import type { HistoryListItem } from "@/types/history";

interface HistoryListProps {
  entries: HistoryListItem[];
  total: number;
  loading: boolean;
  showAll: boolean;
  onToggleShowAll: () => void;
  onReload: (id: number) => Promise<ExtractionResponse>;
  onDelete: (id: number) => Promise<void>;
  onReloadSuccess: (response: ExtractionResponse) => void;
}

/** Short relative-then-absolute date used by each history row. */
function formatEntryDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (differenceInDays(new Date(), date) >= 7) {
    return format(date, "MMM d, yyyy");
  }
  return formatDistanceToNow(date, { addSuffix: true });
}

/** CSV columns emitted by the toolbar export. */
const CSV_COLUMNS: ReadonlyArray<CSVColumn<HistoryListItem>> = [
  { key: "filename", label: "File" },
  { key: "format", label: "Format", format: (v) => String(v ?? "").toUpperCase() },
  {
    key: "created_at",
    label: "Date",
    format: (v) => new Date(String(v)).toISOString(),
  },
  { key: "structure_count", label: "Structures" },
  { key: "reaction_count", label: "Reactions" },
  { key: "file_size", label: "File size (bytes)" },
  {
    key: "extraction_time_ms",
    label: "Extraction time (ms)",
    format: (v) => (typeof v === "number" ? v.toFixed(1) : ""),
  },
];

/** Lowercase matcher — filename + format. */
function matchesQuery(entry: HistoryListItem, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    entry.filename.toLowerCase().includes(needle) ||
    (entry.format ?? "").toLowerCase().includes(needle)
  );
}

/**
 * Row-level delete controller. Kept inline so the parent row can
 * animate the opacity out while the delete request is in flight.
 * Row click is the single reload/open affordance — no per-row reload
 * button. See commit history (I-1) for the drop rationale.
 */
function HistoryRow({
  entry,
  index,
  onRowClick,
  onDelete,
}: {
  entry: HistoryListItem;
  index: number;
  onRowClick: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fading, setFading] = useState(false);

  const isEven = index % 2 === 0;

  async function handleConfirmDelete() {
    setShowConfirm(false);
    setFading(true);
    setDeleting(true);
    try {
      await onDelete();
    } catch {
      setFading(false);
      setDeleting(false);
    }
  }

  const dateLabel = formatEntryDate(entry.created_at);

  return (
    <>
      <li
        data-slot="history-row"
        data-even={isEven ? "true" : undefined}
        className={cn(
          "group grid cursor-pointer items-center gap-4 px-5 py-3 text-sm transition-colors",
          "grid-cols-[1fr_auto_auto_auto_auto]",
          "hover:bg-accent/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          !isEven && "bg-surface-elevated",
          fading && "opacity-0 transition-opacity duration-200",
        )}
        role="button"
        tabIndex={0}
        onClick={async () => {
          if (deleting) return;
          await onRowClick();
        }}
        onKeyDown={async (e) => {
          if (deleting) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            await onRowClick();
          }
        }}
        aria-label={`Open extraction ${entry.filename}`}
      >
        <span
          className="min-w-0 truncate font-mono text-foreground"
          title={entry.filename}
        >
          {entry.filename}
        </span>
        <span className="whitespace-nowrap text-foreground-muted">
          {dateLabel}
        </span>
        <span className="w-16 text-right tabular-nums text-foreground">
          {entry.structure_count}
        </span>
        <span className="w-16 text-right tabular-nums text-foreground">
          {entry.reaction_count}
        </span>
        <div
          className="flex items-center gap-1"
          // Swallow activation on the actions column so clicking an action
          // button doesn't also reload the row.
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setShowConfirm(true);
                    }}
                    disabled={deleting}
                    aria-label="Delete extraction"
                    data-slot="history-row-delete"
                    className="text-foreground-muted hover:text-destructive"
                  />
                }
              >
                <Trash2Icon className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </li>

      <DeleteConfirmDialog
        open={showConfirm}
        filename={entry.filename}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

/** Phase 3 rewrite — bento glass list. See module comment. */
export function HistoryList({
  entries,
  total,
  loading,
  showAll,
  onToggleShowAll,
  onReload,
  onDelete,
  onReloadSuccess,
}: HistoryListProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 150);

  const filteredEntries = useMemo(
    () => entries.filter((e) => matchesQuery(e, debouncedSearch)),
    [entries, debouncedSearch],
  );

  const exportCsv = useCSVExport<HistoryListItem>();

  const handleExportCsv = useCallback(() => {
    if (filteredEntries.length === 0) {
      toast.info("Nothing to export — adjust your search first.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    exportCsv(filteredEntries, {
      filename: `bchemxtract-history-${stamp}.csv`,
      columns: CSV_COLUMNS,
    });
  }, [filteredEntries, exportCsv]);

  const handleRowClick = useCallback(
    async (id: number) => {
      try {
        const response = await onReload(id);
        onReloadSuccess(response);
      } catch {
        toast.error("Failed to load extraction. Try again.");
      }
    },
    [onReload, onReloadSuccess],
  );

  // Loading-first branch: show header + skeleton rows so the layout
  // doesn't pop in.
  if (loading && entries.length === 0) {
    return (
      <section
        aria-label="Recent extractions"
        data-slot="history-list"
        className="overflow-hidden rounded-lg border border-border bg-surface"
      >
        <Toolbar
          search=""
          onSearchChange={() => {}}
          onExport={() => {}}
          exportDisabled
        />
        <Header />
        <div className="divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="mx-5 my-3 h-8" />
          ))}
        </div>
      </section>
    );
  }

  // D-19 empty state: no extractions and not loading → shared EmptyState.
  if (!loading && entries.length === 0 && total === 0) {
    return (
      <EmptyState
        icon={ClockIcon}
        title="No extractions yet"
        message="Upload a CDX or CDXML file to get started."
        size="compact"
      />
    );
  }

  return (
    <section
      aria-label="Recent extractions"
      data-slot="history-list"
      className="overflow-hidden rounded-lg border border-border bg-surface"
    >
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        onExport={handleExportCsv}
        exportDisabled={filteredEntries.length === 0}
      />
      <Header />

      {filteredEntries.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-foreground-muted">
          No extractions match &ldquo;{search}&rdquo;.
        </p>
      ) : (
        <ul role="list" className="divide-y divide-border">
          {filteredEntries.map((entry, idx) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              index={idx}
              onRowClick={() => handleRowClick(entry.id)}
              onDelete={() => onDelete(entry.id)}
            />
          ))}
        </ul>
      )}

      {!loading && total > 10 && (
        <div className="border-t border-border px-5 py-3">
          <Button
            variant="ghost"
            data-underline
            className="h-auto min-h-[44px] rounded-full p-0 text-sm font-normal text-primary"
            onClick={onToggleShowAll}
            data-slot="history-toggle-show-all"
          >
            {showAll ? "Show less" : `Show all ${total} extractions`}
          </Button>
        </div>
      )}
    </section>
  );
}

/** Sticky glass toolbar — search + export CSV. */
function Toolbar({
  search,
  onSearchChange,
  onExport,
  exportDisabled,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  onExport: () => void;
  exportDisabled: boolean;
}) {
  return (
    <div
      data-slot="history-toolbar"
      className={cn(
        "flex flex-col gap-3 border-b border-border px-5 py-3",
        "bg-[var(--glass-tint-light)] dark:bg-[var(--glass-tint-dark)]",
        "backdrop-blur-[var(--glass-blur)] backdrop-saturate-[var(--glass-saturate)]",
        "sm:flex-row sm:items-center sm:justify-between",
      )}
    >
      <h2 className="font-display text-xl font-semibold leading-tight text-foreground">
        Recent extractions
      </h2>
      <div className="flex flex-1 items-center gap-2 sm:flex-none sm:justify-end">
        <div className="relative w-full sm:w-64">
          <SearchIcon
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onSearchChange(e.target.value)
            }
            placeholder="Search by filename or format"
            aria-label="Search history"
            data-slot="history-search"
            className="pl-8"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={exportDisabled}
          data-slot="history-export-csv"
          aria-label="Export history to CSV"
          icon={<DownloadIcon />}
        >
          Export CSV
        </Button>
      </div>
    </div>
  );
}

/** Sticky column header row. */
function Header() {
  return (
    <div
      data-slot="history-header"
      className={cn(
        "grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b border-border px-5 py-2",
        "bg-[var(--glass-tint-light)] dark:bg-[var(--glass-tint-dark)]",
        "backdrop-blur-[var(--glass-blur)] backdrop-saturate-[var(--glass-saturate)]",
      )}
    >
      <span className="text-caption font-semibold uppercase tracking-wide text-foreground-muted">
        File
      </span>
      <span className="whitespace-nowrap text-caption font-semibold uppercase tracking-wide text-foreground-muted">
        Date
      </span>
      <span className="w-16 text-right text-caption font-semibold uppercase tracking-wide text-foreground-muted">
        Structures
      </span>
      <span className="w-16 text-right text-caption font-semibold uppercase tracking-wide text-foreground-muted">
        Reactions
      </span>
      <span className="w-[72px] text-right text-caption font-semibold uppercase tracking-wide text-foreground-muted">
        Actions
      </span>
    </div>
  );
}
