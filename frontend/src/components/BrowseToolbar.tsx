/**
 * BrowseToolbar — grid/table toggle, sort dropdown, page size selector,
 * structure count, selection badge, and export action bar (D-04, D-11, D-13, D-16, D-17).
 *
 * Layout: flex row, 48px height, border-b.
 * Mobile: Sort + page size collapse into an "Options" Popover.
 */
import { LayoutGridIcon, ListIcon, SlidersHorizontalIcon } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
}: BrowseToolbarProps) {
  async function handleExport(format: ExportFormat): Promise<void> {
    const toastId = `export-${Date.now()}`;
    toast.loading("Preparing export\u2026", { id: toastId });
    try {
      await postExport(
        { format, substance_ids: Array.from(selectedIds) },
        `export.${FORMAT_EXT[format]}`
      );
      toast.success("Export ready \u2014 downloading", { id: toastId, duration: 3000 });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Export failed \u2014 ${reason}. Try again.`, { id: toastId });
    }
  }

  async function handleExportAll(format: ExportFormat): Promise<void> {
    if (!extractionId) return;
    const toastId = `export-all-${Date.now()}`;
    toast.loading("Preparing export\u2026", { id: toastId });
    try {
      await postExport(
        { format, substance_ids: [], extraction_id: extractionId },
        `export_all.${FORMAT_EXT[format]}`
      );
      toast.success("Export ready \u2014 downloading", { id: toastId, duration: 3000 });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Export failed \u2014 ${reason}. Try again.`, { id: toastId });
    }
  }

  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);
  const countLabel =
    total === 0
      ? "No structures"
      : total === 1
      ? "Showing 1 of 1 structure"
      : `Showing ${start}\u2013${end} of ${total} structures`;

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-6 py-3 h-12 border-b border-border",
        disabled && "opacity-50 pointer-events-none"
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

      {/* Sort dropdown — hidden on mobile, shown in Options popover */}
      <div className="hidden sm:flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Sort by</span>
        <Select
          value={sort}
          onValueChange={(v) => v && onSortChange(v as BrowseSort)}
        >
          <SelectTrigger className="h-8 w-[160px]" aria-label="Sort order">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="extraction_order">Extraction order</SelectItem>
            <SelectItem value="formula">Molecular formula</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Page size dropdown — hidden on mobile */}
      <div className="hidden sm:flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Per page</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) =>
            v && onPageSizeChange(parseInt(v, 10) as 12 | 24 | 48)
          }
        >
          <SelectTrigger className="h-8 w-[72px]" aria-label="Items per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="12">12</SelectItem>
            <SelectItem value="24">24</SelectItem>
            <SelectItem value="48">48</SelectItem>
          </SelectContent>
        </Select>
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
            <Select
              value={sort}
              onValueChange={(v) => v && onSortChange(v as BrowseSort)}
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="extraction_order">Extraction order</SelectItem>
                <SelectItem value="formula">Molecular formula</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) =>
                v && onPageSizeChange(parseInt(v, 10) as 12 | 24 | 48)
              }
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12">12</SelectItem>
                <SelectItem value="24">24</SelectItem>
                <SelectItem value="48">48</SelectItem>
              </SelectContent>
            </Select>
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
          disabled={total === 0}
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
