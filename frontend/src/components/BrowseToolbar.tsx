/**
 * BrowseToolbar — grid/table toggle, sort dropdown, page size selector,
 * structure count, and selection badge (D-04, D-11, D-13, D-16, D-17).
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
import { cn } from "@/lib/utils";
import type { BrowseView, BrowseSort } from "@/hooks/useBrowse";

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
}

/**
 * BrowseToolbar component (D-04, D-11, D-13, D-16, D-17).
 * Renders a 48px toolbar row with view toggle, sort/size selects, count, and selection badge.
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
}: BrowseToolbarProps) {
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
        type="single"
        value={view}
        onValueChange={(v: string) => v && onViewChange(v as BrowseView)}
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
          onValueChange={(v: string) => onSortChange(v as BrowseSort)}
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
          onValueChange={(v: string) =>
            onPageSizeChange(parseInt(v, 10) as 12 | 24 | 48)
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
              onValueChange={(v: string) => onSortChange(v as BrowseSort)}
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
              onValueChange={(v: string) =>
                onPageSizeChange(parseInt(v, 10) as 12 | 24 | 48)
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

      {/* Selection count badge — only shown when selections exist (D-17) */}
      {selectedCount > 0 && (
        <Badge variant="secondary" className="text-xs font-semibold">
          {selectedCount} selected
        </Badge>
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
