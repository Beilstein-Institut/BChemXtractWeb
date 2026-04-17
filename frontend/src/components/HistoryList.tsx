/**
 * HistoryList — section wrapper for extraction history (Phase 5).
 * UI-SPEC: "Recent Extractions" heading (28px w-400), divide-y list,
 * "Show all {N}" / "Show less" link in text-primary.
 * Hidden when zero entries (D-09).
 */

import { ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { ExtractionResponse } from "@/types/chemistry";
import type { HistoryListItem } from "@/types/history";
import { HistoryEntry } from "./HistoryEntry";
import { toast } from "sonner";

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

/** Renders up to 10 history entries (or all when expanded). Hidden when empty (D-09). */
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
  // D-19: Shared EmptyState when no extractions exist (compact variant)
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

  async function handleReload(id: number) {
    try {
      const response = await onReload(id);
      onReloadSuccess(response);
    } catch {
      toast.error("Failed to load extraction. Try again.");
    }
  }

  return (
    <section aria-label="Recent Extractions">
      <h2 className="text-heading font-normal tracking-tight text-foreground mb-6">
        Recent Extractions
      </h2>

      {loading ? (
        <div className="divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 my-0.5" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((entry) => (
            <HistoryEntry
              key={entry.id}
              entry={entry}
              onReload={handleReload}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}

      {/* Show all / Show less link — only when there are more entries than displayed */}
      {!loading && total > 10 && (
        <div className="mt-3">
          <Button
            variant="link"
            className="text-[14px] font-normal text-primary p-0 h-auto underline-offset-2 hover:underline min-h-[44px] rounded-full"
            onClick={onToggleShowAll}
          >
            {showAll ? "Show less" : `Show all ${total} extractions`}
          </Button>
        </div>
      )}
    </section>
  );
}
