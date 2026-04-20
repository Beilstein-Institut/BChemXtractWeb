/**
 * HistoryPage — past extractions + aggregate stats (route: `/history`).
 *
 * Thin presentational page that composes <StatCard> and <HistoryList>.
 * Hooks/state live in App.tsx and are passed in as props.
 */
import { toast } from "sonner";
import { FileUpIcon } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { HistoryList } from "@/components/HistoryList";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/lib/Link";
import type { HistoryListItem, StatsResponse } from "@/types/history";
import type { ExtractionResponse } from "@/types/chemistry";
import type { HistoryState } from "@/hooks/useHistory";

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
  const hasAny =
    total > 0 || entries.length > 0 || (stats !== null && stats.total_extractions > 0);

  return (
    <>
      <header className="pt-2">
        <h1 className="text-display font-semibold leading-[1.10] tracking-tight">
          History
        </h1>
        <p className="mt-4 text-sub-heading font-normal text-muted-foreground tracking-tight">
          Revisit, search, and download your past extractions.
        </p>
      </header>

      {!hasAny ? (
        <div className="mt-16">
          <EmptyState
            icon={FileUpIcon}
            title="No extractions yet"
            message="Upload your first ChemDraw file to build up a searchable history."
            action={
              <Link to="/" className={buttonVariants({ size: "lg" })}>
                Upload a file
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <section className="mt-[48px]">
            <h2 className="text-heading font-normal tracking-tight text-foreground mb-4">
              Summary
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Total extractions"
                value={stats?.total_extractions ?? ""}
                loading={statsLoading && stats === null}
              />
              <StatCard
                label="Unique structures"
                value={stats?.unique_structures ?? ""}
                loading={statsLoading && stats === null}
              />
              <StatCard
                label="Most common formula"
                value={stats?.most_common_formula ?? ""}
                loading={statsLoading && stats === null}
              />
            </div>
          </section>

          <section className="mt-[32px]">
            <HistoryList
              entries={entries}
              total={total}
              loading={historyState === "loading"}
              showAll={showAll}
              onToggleShowAll={onToggleShowAll}
              onReload={onReload}
              onDelete={async (id) => {
                try {
                  await onDelete(id);
                } catch {
                  toast.error("Could not delete extraction. Try again.");
                }
              }}
              onReloadSuccess={onReloadSuccess}
            />
          </section>
        </>
      )}
    </>
  );
}
