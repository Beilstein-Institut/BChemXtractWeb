/**
 * StructureBrowser — paginated structure browsing UI orchestrator.
 *
 * Combines: useBrowse hook, BrowseToolbar, StructureCard grid or StructureTable,
 * shadcn Pagination, and StructureSheet detail panel.
 *
 * Sheet is controlled at this level: one Sheet instance, sheetIndex
 * updates without toggling open state — no close/reopen animation when clicking
 * a different card while the sheet is open.
 *
 * Security mitigations applied via child components:
 * - SVG rendered via Blob URL (useSvgObjectUrl) in StructureSheet and StructureCard
 * - Keyboard listener scoped to open state in StructureSheet
 * - onPrev/onNext clamped with Math.max/Math.min to [0, substances.length-1]
 */
import { useMemo, useState } from "react";
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
import { DEFAULT_DEPICTION } from "@/lib/depiction";
import type { Depiction, PubChemCardState } from "@/types/chemistry";

// Stable empty map so the default prop value doesn't change identity across
// renders (avoids needless work in memoized children).
const EMPTY_PUBCHEM: ReadonlyMap<string, PubChemCardState> = new Map();

export interface StructureBrowserProps {
  /** The extraction ID to browse. Null/undefined renders idle state. */
  extractionId: number | null | undefined;
  /**
   * Kept for API compatibility with callers that previously let the browser
   * reset back to the extract flow. Unused internally — reset navigation is
   * now handled from the parent via routing.
   */
  onReset?: () => void;
  /**
   * When true, the toolbar's ExportMenu enables the RXN/RDfile entry.
   * True when reactions exist for the active extraction — either freshly
   * extracted in the Reactions tab or hydrated from the cached
   * reactions path. Defaults to false.
   */
  reactionsAvailable?: boolean;
  /**
   * Active 2D layout for all structure renders (cards, table, sheet) and
   * for image exports. Defaults to CDK ("cdk").
   */
  depiction?: Depiction;
  /** Forwarded to BrowseToolbar's ChemDraw/CDK toggle. */
  onDepictionChange?: (depiction: Depiction) => void;
  /**
   * PubChem enrichment map keyed by InChIKey, owned by the parent so the
   * whole extraction is enriched once (also feeds the receipt) instead of the
   * grid firing its own duplicate per-page lookups. Empty when the user has
   * not opted in. Missing keys render no PubChem chrome.
   */
  pubchem?: ReadonlyMap<string, PubChemCardState>;
}

/**
 * Build page number array with ellipsis. Max 5 page number buttons visible.
 * sheetIndex is clamped externally; this helper is pure pagination math.
 */
function buildPageNumbers(current: number, total: number): (number | "...")[] {
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
export function StructureBrowser({
  extractionId,
  reactionsAvailable = false,
  depiction = DEFAULT_DEPICTION,
  onDepictionChange,
  pubchem = EMPTY_PUBCHEM,
}: StructureBrowserProps) {
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

  // Sheet controlled state: update index without toggling open
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(0);

  function handleOpenStructure(index: number) {
    setSheetIndex(index);
    setSheetOpen(true);
  }

  // Current server page slice. Pulling `page?.items` inside the useMemo keeps
  // the dep array stable across renders (outside the memo the fallback `??`
  // would produce a new array literal every render).
  const substances = useMemo(() => page?.items ?? [], [page]);
  const activeSubstance = substances[sheetIndex] ?? null;
  const allSelected = substances.length > 0 && substances.every((s) => selectedIds.has(s.id));
  const totalPages = page?.pages ?? 0;

  return (
    <div data-slot="structure-browser">
      {/* Toolbar — disabled during initial load */}
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
        pageItemCount={substances.length}
        allSelected={allSelected}
        onToggleSelectAll={allSelected ? clearSelection : selectAll}
        reactionsAvailable={reactionsAvailable}
        depiction={depiction}
        onDepictionChange={onDepictionChange}
      />

      {/* Loading state — skeleton cards/rows */}
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

      {/* Error state */}
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

      {/* Empty state — no structures for this extraction. */}
      {browseState === "success" && substances.length === 0 && (
        <EmptyState
          icon={LayoutGridIcon}
          title="Nothing to browse yet"
          message="Upload a ChemDraw file or open a past extraction from your history to see its structures here."
          size="large"
        />
      )}

      {/* Grid view */}
      {browseState === "success" && substances.length > 0 && view === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {substances.map((substance, index) => (
            // Composite key: ids can be 0 across a fresh-upload envelope,
            // and `id ?? …` does not fall back on 0.
            <StructureCard
              key={`${substance.id}-${substance.inchi_key}-${index}`}
              substance={substance}
              itemIndex={index}
              onOpen={handleOpenStructure}
              isChecked={selectedIds.has(substance.id)}
              onSelect={toggleSelect}
              depiction={depiction}
              pubchem={pubchem.get(substance.inchi_key)}
            />
          ))}
        </div>
      )}

      {/* Table view */}
      {browseState === "success" && substances.length > 0 && view === "table" && (
        <div className="mt-6">
          <StructureTable
            substances={substances}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAll={allSelected ? clearSelection : selectAll}
            allSelected={allSelected}
            onOpen={handleOpenStructure}
            depiction={depiction}
          />
        </div>
      )}

      {/* Pagination — hidden during loading */}
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

      {/* Sheet — single instance, controlled open state */}
      <StructureSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        substance={activeSubstance}
        substanceIndex={sheetIndex}
        totalSubstances={substances.length}
        onPrev={() => setSheetIndex((i) => Math.max(0, i - 1))}
        onNext={() => setSheetIndex((i) => Math.min(substances.length - 1, i + 1))}
        depiction={depiction}
      />
    </div>
  );
}
