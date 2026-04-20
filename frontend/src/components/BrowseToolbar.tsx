/**
 * BrowseToolbar — grid/table toggle, sort dropdown, page size selector,
 * structure count, selection badge, and export action bar (D-04, D-11, D-13, D-16, D-17).
 *
 * Layout: flex row, 48px height, border-b.
 * Mobile: Sort + page size collapse into an "Options" Popover.
 */
import { useState } from "react";
import { LayoutGridIcon, ListIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { BrowseView, BrowseSort } from "@/hooks/useBrowse";
import { ExportMenu } from "@/components/ExportMenu";
import { postExport } from "@/lib/apiClient";
import type { ExportFormat } from "@/types/export";
import { FORMAT_EXT } from "@/types/export";

export interface BrowseToolbarProps {
  view: BrowseView;
  onViewChange: (v: BrowseView) => void;
  sort: BrowseSort;
  onSortChange: (s: BrowseSort) => void;
  pageSize: 12 | 24 | 48;
  onPageSizeChange: (n: 12 | 24 | 48) => void;
  total: number;
  currentPage: number;
  selectedCount: number;
  disabled?: boolean;
  /** IDs of currently selected substances (for "Export N selected"). */
  selectedIds: Set<number>;
  /** Current extraction ID — used for Export All. Null when no extraction active. */
  extractionId: number | null;
  /**
   * Callback fired when "Search within this extraction" is clicked (D-20).
   * The button is hidden when this is undefined or `extractionId` is null.
   * Parent writes `?scope=extraction:{id}` to the URL and focuses the
   * header SearchInput (via `searchInputRef` from `@/lib/searchFocus`).
   */
  onSearchWithin?: () => void;
  /**
   * When true, the ExportMenu enables the RXN/RDfile entry (Plan 10 D-22 /
   * EXPO-08). True when reactions exist for the active extraction. Defaults
   * to false (RXN entry stays disabled with the "no reactions" tooltip).
   */
  reactionsAvailable?: boolean;
}

/**
 * BrowseToolbar component (D-04, D-11, D-13, D-16, D-17).
 * Renders a 48px toolbar row with view toggle, sort/size selects, count, selection badge,
 * and export action bar (D-01, D-03).
 */
export function BrowseToolbar({
  view,
  onViewChange,
  sort,
  onSortChange,
  pageSize,
  onPageSizeChange,
  total,
  currentPage,
  selectedCount,
  disabled = false,
  selectedIds,
  extractionId,
  onSearchWithin,
  reactionsAvailable = false,
}: BrowseToolbarProps) {
  const [isExporting, setIsExporting] = useState(false);

  async function runExport(
    toastPrefix: string,
    suggestedFilename: string,
    payload: Parameters<typeof postExport>[0],
  ): Promise<void> {
    setIsExporting(true);
    const toastId = `${toastPrefix}-${Date.now()}`;
    toast.loading("Preparing export\u2026", { id: toastId });
    try {
      await postExport(payload, suggestedFilename);
      toast.success("Export ready \u2014 downloading", {
        id: toastId,
        duration: 3000,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Export failed \u2014 ${reason}. Try again.`, { id: toastId });
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExport(format: ExportFormat): Promise<void> {
    if (isExporting) return;
    await runExport("export", `export.${FORMAT_EXT[format]}`, {
      format,
      substance_ids: Array.from(selectedIds),
    });
  }

  async function handleExportAll(format: ExportFormat): Promise<void> {
    if (!extractionId || isExporting) return;
    await runExport("export-all", `export_all.${FORMAT_EXT[format]}`, {
      format,
      substance_ids: [],
      extraction_id: extractionId,
    });
  }

  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);
  let countLabel: string;
  if (total === 0) {
    countLabel = "No structures";
  } else if (total === 1) {
    countLabel = "Showing 1 of 1 structure";
  } else {
    countLabel = `Showing ${start}\u2013${end} of ${total} structures`;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-6 py-3 h-12 border-b border-border",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      {/* Grid / Table view toggle */}
      <ToggleGroup
        value={[view]}
        onValueChange={(values: string[]) => {
          const next = values.find((v) => v !== view);
          if (next) onViewChange(next as BrowseView);
        }}
        aria-label="View mode"
      >
        <ToggleGroupItem value="grid" aria-label="Grid view" className="h-9 w-9 p-0">
          <LayoutGridIcon className="size-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="table" aria-label="Table view" className="h-9 w-9 p-0">
          <ListIcon className="size-4" />
        </ToggleGroupItem>
      </ToggleGroup>

      {/* Search within this extraction (D-20) — immediately right of the view
          toggle per UI-SPEC §4. Hidden when no extraction is active or when
          the parent did not provide a handler. Focuses the header SearchInput
          via `searchInputRef` (fix #8 — no DOM queries). */}
      {extractionId !== null && onSearchWithin && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5"
          onClick={onSearchWithin}
          aria-label="Search within this extraction"
        >
          <SearchIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="hidden sm:inline text-caption">Search within</span>
        </Button>
      )}

      {/* Sort dropdown — hidden on mobile, shown in Options popover */}
      <div className="hidden sm:flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Sort by</span>
        {renderSortSelect(sort, onSortChange, "w-[160px]", "Sort order")}
      </div>

      {/* Page size dropdown — hidden on mobile */}
      <div className="hidden sm:flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Per page</span>
        {renderPageSizeSelect(pageSize, onPageSizeChange, "w-[72px]", "Items per page")}
      </div>

      {/* Mobile Options popover — sort + size collapsed into one button */}
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="sm:hidden h-8 gap-1.5"
              aria-label="Options"
            />
          }
        >
          <SlidersHorizontalIcon className="size-4" />
          <span>Options</span>
        </PopoverTrigger>
        <PopoverContent className="w-56 flex flex-col gap-3 p-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Sort by</span>
            {renderSortSelect(sort, onSortChange, "w-full")}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Per page</span>
            {renderPageSizeSelect(pageSize, onPageSizeChange, "w-full")}
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex-1" />

      {/* Export "N selected" button — only when selections exist (D-01) */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2" aria-live="polite">
          <Badge variant="secondary" className="text-xs font-semibold">
            {selectedCount} selected
          </Badge>
          <ExportMenu
            onExport={handleExport}
            triggerLabel={`Export ${selectedCount} selected`}
            triggerVariant="label"
            align="end"
            disabled={isExporting || selectedCount === 0}
            reactionsAvailable={reactionsAvailable}
          />
        </div>
      )}

      {/* Export All — always visible when extraction is active and has substances (D-03) */}
      {extractionId !== null && total > 0 && (
        <ExportMenu
          onExport={handleExportAll}
          triggerLabel="Export All"
          triggerVariant="label"
          align="end"
          disabled={isExporting}
          reactionsAvailable={reactionsAvailable}
        />
      )}

      {/* Structure count label */}
      <span
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground font-semibold hidden sm:block"
      >
        {countLabel}
      </span>
    </div>
  );
}

function renderSortSelect(
  value: BrowseSort,
  onChange: (v: BrowseSort) => void,
  triggerWidth: string,
  ariaLabel?: string,
) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as BrowseSort)}>
      <SelectTrigger className={cn("h-8", triggerWidth)} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="extraction_order">Extraction order</SelectItem>
        <SelectItem value="formula">Molecular formula</SelectItem>
      </SelectContent>
    </Select>
  );
}

function renderPageSizeSelect(
  value: 12 | 24 | 48,
  onChange: (n: 12 | 24 | 48) => void,
  triggerWidth: string,
  ariaLabel?: string,
) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => v && onChange(parseInt(v, 10) as 12 | 24 | 48)}
    >
      <SelectTrigger className={cn("h-8", triggerWidth)} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="12">12</SelectItem>
        <SelectItem value="24">24</SelectItem>
        <SelectItem value="48">48</SelectItem>
      </SelectContent>
    </Select>
  );
}

