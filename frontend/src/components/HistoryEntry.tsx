/**
 * HistoryEntry — one extraction row in the history list (Phase 5).
 * UI-SPEC: flex row, filename left, metadata below, reload+trash right (hover visible).
 * Animations: fade-out on delete (opacity-0 transition-opacity duration-200).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LoaderIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import type { HistoryListItem } from "@/types/history";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

interface HistoryEntryProps {
  entry: HistoryListItem;
  onReload: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

/** Format date per UI-SPEC: "just now" / "2 min ago" / "Apr 10" after 7 days. */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const daysAgo = differenceInDays(new Date(), date);
  if (daysAgo >= 7) {
    return format(date, "MMM d");
  }
  return formatDistanceToNow(date, { addSuffix: true });
}

/** Single extraction history row. */
export function HistoryEntry({ entry, onReload, onDelete }: HistoryEntryProps) {
  const [reloading, setReloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fading, setFading] = useState(false);

  async function handleReload() {
    setReloading(true);
    try {
      await onReload(entry.id);
    } finally {
      setReloading(false);
    }
  }

  async function handleDeleteConfirm() {
    setShowConfirm(false);
    setFading(true);
    setDeleting(true);
    try {
      await onDelete(entry.id);
    } catch {
      setFading(false);
      setDeleting(false);
    }
  }

  const relTime = formatRelativeTime(entry.created_at);

  return (
    <>
      <li
        className={cn(
          "group flex items-center justify-between gap-4 py-3 px-0",
          "hover:bg-muted/20 transition-colors",
          "opacity-100 transition-opacity duration-200",
          fading && "opacity-0"
        )}
      >
        {/* Left: filename + metadata */}
        <div className="min-w-0 flex-1">
          <p className="truncate max-w-xs text-body tracking-[-0.022em] text-foreground">
            {entry.filename}
          </p>
          <p className="text-caption text-muted-foreground">
            {entry.structure_count} structure{entry.structure_count !== 1 ? "s" : ""} · {relTime}
          </p>
        </div>

        {/* Right: actions — visible on hover/focus-within, always visible on mobile */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 sm:opacity-100">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReload}
                    disabled={reloading || deleting}
                    aria-label="Reload extraction"
                    className="text-muted-foreground hover:text-primary"
                  />
                }
              >
                {reloading ? (
                  <LoaderIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcwIcon className="h-4 w-4" />
                )}
                <span className="ml-1 hidden sm:inline">Reload extraction</span>
              </TooltipTrigger>
              <TooltipContent>Reload this extraction</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowConfirm(true)}
                    disabled={reloading || deleting}
                    aria-label="Delete extraction"
                    className="text-muted-foreground hover:text-destructive"
                  />
                }
              >
                <Trash2Icon className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </li>

      <DeleteConfirmDialog
        open={showConfirm}
        filename={entry.filename}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
