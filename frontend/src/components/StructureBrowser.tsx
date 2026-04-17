/**
 * StructureBrowser — paginated structure browsing UI orchestrator (Phase 6).
 *
 * Combines: useBrowse hook, BrowseToolbar, StructureCard grid or StructureTable,
 * shadcn Pagination, and StructureSheet detail panel.
 *
 * Sheet is controlled at this level (D-10): one Sheet instance, sheetIndex
 * updates without toggling open state — no close/reopen animation when clicking
 * a different card while the sheet is open.
 *
 * STRIDE mitigations applied via child components:
 * - T-06-09: SVG data URI in StructureSheet and StructureCard (encodeURIComponent)
 * - T-06-10: Keyboard listener scoped to open state in StructureSheet
 * - T-06-11: onPrev/onNext clamped with Math.max/Math.min to [0, substances.length-1]
 */
import { useState } from "react";
import { AlertCircleIcon, LayoutGridIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { useBrowse } from "@/hooks/useBrowse";
import { BrowseToolbar } from "@/components/BrowseToolbar";
import { StructureCard } from "@/components/StructureCard";
import { StructureTable } from "@/components/StructureTable";
import { StructureSheet } from "@/components/StructureSheet";

export interface StructureBrowserProps {
  /** The extraction ID to browse. Null/undefined renders idle state. */
  extractionId: number | null | undefined;
  /** Called when user wishes to reset back to upload state. */
  onReset: () => void;
}

/**
 * Build page number array with ellipsis. Max 5 page number buttons visible.
 * T-06-11: sheetIndex is clamped externally; this helper is pure pagination math.
 */
export function buildPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

/**
 * StructureBrowser — the complete browsing UI with toolbar, grid/table views,
 * pagination, and a side-sheet detail panel.
 */
export function StructureBrowser({ extractionId, onReset: _onReset }: StructureBrowserProps) {
  const {
    browseState,
    page,
    view,
    sort,
    pageSize,
    currentPage,
    selectedIds,
    setView,
    setSort,
    setPageSize,
    goToPage,
    toggleSelect,
    selectAll,
    clearSelection,
  } = useBrowse(extractionId);

  // Sheet controlled state (D-10): update index without toggling open
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(0);

  function handleOpenStructure(index: number) {
    setSheetIndex(index);
    setSheetOpen(true);
  }

  const substances = page?.items ?? [];
  const activeSubstance = substances[sheetIndex] ?? null;
  const allSelected = substances.length > 0 && substances.every((s) => selectedIds.has(s.id));
  const totalPages = page?.pages ?? 0;

  return (
    <div>
      {/* Toolbar — disabled during initial load (D-14) */}
      <BrowseToolbar
        view={view}
        onViewChange={setView}
        sort={sort}
        onSortChange={setSort}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        total={page?.total ?? 0}
        currentPage={currentPage}
        selectedCount={selectedIds.size}
        selectedIds={selectedIds}
        extractionId={extractionId ?? null}
        disabled={browseState === "loading" && page === null}
      />

      {/* Loading state — skeleton cards/rows (D-13) */}
      {browseState === "loading" &&
        page === null &&
        (view === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {Array.from({ length: pageSize }).map((_, i) => (
              <Skeleton key={i} className="h-[300px] rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="mt-6 space-y-2">
            {Array.from({ length: pageSize }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded" />
            ))}
          </div>
        ))}

      {/* Error state (D-19) */}
      {browseState === "error" && (
        <EmptyState
          icon={AlertCircleIcon}
          title="Couldn't load structures"
          message="Check your connection and try again."
          size="large"
          action={
            <Button variant="outline" onClick={() => goToPage(currentPage)}>
              Try again
            </Button>
          }
        />
      )}

      {/* Empty state (D-19) */}
      {browseState === "success" && substances.length === 0 && (
        <EmptyState
          icon={LayoutGridIcon}
          title="Nothing to browse yet"
          message="Upload a file or pick an extraction from your history to see its structures here."
          size="large"
        />
      )}

      {/* Grid view (D-05) */}
      {browseState === "success" && substances.length > 0 && view === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {substances.map((substance, index) => (
            <StructureCard
              key={substance.id ?? `${substance.inchi_key}-${index}`}
              substance={substance}
              itemIndex={index}
              onOpen={handleOpenStructure}
              isChecked={selectedIds.has(substance.id)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* Table view (D-06) */}
      {browseState === "success" && substances.length > 0 && view === "table" && (
        <div className="mt-6">
          <StructureTable
            substances={substances}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAll={allSelected ? clearSelection : selectAll}
            allSelected={allSelected}
            onOpen={handleOpenStructure}
          />
        </div>
      )}

      {/* Pagination (D-03) — hidden during loading */}
      {browseState === "success" && totalPages > 1 && (
        <div className="mt-6 flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => currentPage > 1 && goToPage(currentPage - 1)}
                  aria-disabled={currentPage <= 1}
                  className={currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              {buildPageNumbers(currentPage, totalPages).map((item, i) =>
                item === "..." ? (
                  <PaginationItem key={`ellipsis-${i}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item}>
                    <PaginationLink
                      isActive={item === currentPage}
                      onClick={() => goToPage(item as number)}
                      className="cursor-pointer"
                    >
                      {item}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}
              <PaginationItem>
                <PaginationNext
                  onClick={() => currentPage < totalPages && goToPage(currentPage + 1)}
                  aria-disabled={currentPage >= totalPages}
                  className={
                    currentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Sheet — single instance, controlled open state (D-10) */}
      <StructureSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        substance={activeSubstance}
        substanceIndex={sheetIndex}
        totalSubstances={substances.length}
        onPrev={() => setSheetIndex((i) => Math.max(0, i - 1))}
        onNext={() => setSheetIndex((i) => Math.min(substances.length - 1, i + 1))}
      />
    </div>
  );
}
