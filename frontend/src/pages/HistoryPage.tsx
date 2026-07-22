/**
 * HistoryPage — Liquid Glass rebuild.
 *
 * Bento dashboard:
 *
 *   Row 1 (4 columns, 1:1 cells):
 *     ┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
 *     │ Total extractions │ Structures found │ Reactions found │ Avg processing  │
 *     │   (primary)       │   (secondary)    │   (secondary)   │   time          │
 *     └──────────────────┴──────────────────┴──────────────────┴──────────────────┘
 *
 *   Row 2 (4 columns, 4:1 list):
 *     ┌──────────────────────────────────────────────────────────────────────────┐
 *     │                         HistoryList (full width)                         │
 *     └──────────────────────────────────────────────────────────────────────────┘
 *
 * Stats sources:
 *   - Total extractions  → `stats.total_extractions` if loaded; else
 *                           `Math.max(total, entries.length)`.
 *   - Structures found   → `stats.unique_structures` if loaded; else
 *                           sum of `structure_count` across the loaded
 *                           entries.
 *   - Reactions found    → sum of `reaction_count` across the loaded
 *                           entries (backend does not expose a global
 *                           reactions total today).
 *   - Avg processing time → mean of `extraction_time_ms` across the
 *                           loaded entries, in milliseconds.
 *
 * The bento consumes the state the parent already fetches through
 * `useHistory` and passes down via props; no new hooks or endpoints.
 */
import { useMemo } from "react";
import { BeakerIcon, FileUpIcon, FlaskConicalIcon, LayersIcon, TimerIcon } from "lucide-react";
import { toast } from "sonner";

import { BentoCell } from "@/components/layout/BentoCell";
import { BentoGrid } from "@/components/layout/BentoGrid";
import { PageContainer } from "@/components/layout/PageContainer";
import { HistoryList } from "@/components/HistoryList";
import { StatCard } from "@/components/StatCard";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { HistoryState } from "@/hooks/useHistory";
import { Link } from "@/lib/Link";
import type { ExtractionResponse } from "@/types/chemistry";
import type { HistoryListItem, StatsResponse } from "@/types/history";
import { computeHistoryStats } from "./historyStats";

export interface HistoryPageProps {
  historyState: HistoryState;
  entries: HistoryListItem[];
  total: number;
  showAll: boolean;
  stats: StatsResponse | null;
  statsLoading: boolean;
  onToggleShowAll: () => void;
  onReload: (id: number) => Promise<ExtractionResponse>;
  onDelete: (id: number) => Promise<void>;
  onReloadSuccess: (response: ExtractionResponse) => void;
}

export function HistoryPage({
  historyState,
  entries,
  total,
  showAll,
  stats,
  statsLoading,
  onToggleShowAll,
  onReload,
  onDelete,
  onReloadSuccess,
}: HistoryPageProps) {
  const hasAny = total > 0 || entries.length > 0 || (stats !== null && stats.total_extractions > 0);

  const computed = useMemo(
    () => computeHistoryStats(entries, stats, total),
    [entries, stats, total],
  );

  // Stat tiles are considered "loading" while the first server stats call
  // is still in-flight AND we haven't received any entries yet; once the
  // list arrives we compute client-side totals so the top bar feels live.
  const statsLoadingVisible = statsLoading && stats === null && entries.length === 0;

  async function handleDelete(id: number) {
    try {
      await onDelete(id);
    } catch {
      toast.error("Delete failed. The extraction may already be gone; refresh and retry.");
    }
  }

  return (
    <PageContainer data-slot="history-page">
      <header className="space-y-2">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          History
        </h1>
        <p className="text-base text-foreground-muted">
          All extractions, searchable and exportable.
        </p>
      </header>

      {!hasAny ? (
        <div className="mt-16">
          <EmptyState
            icon={FileUpIcon}
            title="No extractions yet"
            message="Upload your first ChemDraw file to build up a searchable history."
            action={
              <Link to="/extract" className={buttonVariants({ size: "lg" })}>
                Upload a file
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <BentoGrid
            cols={4}
            className="mt-8 auto-rows-[minmax(128px,auto)]"
            data-slot="history-stats"
          >
            <BentoCell span="1:1" data-slot="history-stat-total">
              <StatCard
                label="Total extractions"
                value={computed.totalExtractions}
                format="count"
                tone="primary"
                icon={<LayersIcon />}
                loading={statsLoadingVisible}
              />
            </BentoCell>
            <BentoCell span="1:1" data-slot="history-stat-structures">
              <StatCard
                label="Structures found"
                value={computed.structuresFound}
                format="count"
                tone="secondary"
                icon={<FlaskConicalIcon />}
                loading={statsLoadingVisible}
              />
            </BentoCell>
            <BentoCell span="1:1" data-slot="history-stat-reactions">
              <StatCard
                label="Reactions found"
                value={computed.reactionsFound}
                format="count"
                tone="secondary"
                icon={<BeakerIcon />}
                loading={statsLoadingVisible}
              />
            </BentoCell>
            <BentoCell span="1:1" data-slot="history-stat-avg-time">
              <StatCard
                label="Avg processing time"
                value={computed.avgProcessingTimeMs}
                format="duration"
                tone="neutral"
                icon={<TimerIcon />}
                loading={statsLoadingVisible}
              />
            </BentoCell>
          </BentoGrid>

          <section className="mt-8">
            <HistoryList
              entries={entries}
              total={total}
              loading={historyState === "loading"}
              showAll={showAll}
              onToggleShowAll={onToggleShowAll}
              onReload={onReload}
              onDelete={handleDelete}
              onReloadSuccess={onReloadSuccess}
            />
          </section>
        </>
      )}
    </PageContainer>
  );
}
