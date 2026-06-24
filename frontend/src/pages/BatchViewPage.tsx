/**
 * BatchViewPage — combined view of every extraction in one batch
 * (route: `/batch?batch=<batch_id>`).
 *
 * Fetches the batch's extraction summaries (RLS-scoped), then each file's
 * full detail, and renders one grouped section per file (filename header +
 * divider) in a table (default) or thumbnail grid. Display-only: click a
 * structure to open its detail; export is the batch ZIP. Survives refresh
 * because the batch id lives in the URL.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { DownloadIcon, FileUpIcon, LayoutGridIcon, ListIcon } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { StructureTable } from "@/components/StructureTable";
import { StructureCard } from "@/components/StructureCard";
import { StructureDetail } from "@/components/StructureDetail";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getBatchExtractions, getHistoryDetail, downloadBatchZip } from "@/lib/apiClient";
import { DEFAULT_DEPICTION } from "@/lib/depiction";
import { Link } from "@/lib/Link";
import type { ExtractionResponse, SubstanceResponse } from "@/types/chemistry";

type View = "table" | "grid";
type LoadState = "loading" | "ready" | "empty" | "error";

interface FileSection {
  extractionId: number;
  filename: string;
  /** null when this file's detail fetch failed (inline section error). */
  detail: ExtractionResponse | null;
}

function batchIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("batch");
}

export function BatchViewPage() {
  const batchId = batchIdFromUrl();
  const [state, setState] = useState<LoadState>("loading");
  const [sections, setSections] = useState<FileSection[]>([]);
  const [view, setView] = useState<View>("table"); // table is the default
  const [active, setActive] = useState<SubstanceResponse | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!batchId) {
      setState("empty");
      return;
    }
    let cancelled = false;
    setState("loading");
    /* eslint-enable react-hooks/set-state-in-effect */
    (async () => {
      try {
        const batch = await getBatchExtractions(batchId);
        // Fetch each file's full detail in parallel; a single failure
        // becomes a null detail (inline section error), not a page failure.
        const details = await Promise.all(
          batch.files.map(async (f): Promise<FileSection> => {
            try {
              return {
                extractionId: f.extraction_id,
                filename: f.filename,
                detail: await getHistoryDetail(f.extraction_id),
              };
            } catch {
              return { extractionId: f.extraction_id, filename: f.filename, detail: null };
            }
          }),
        );
        if (cancelled) return;
        setSections(details);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const totalStructures = useMemo(
    () => sections.reduce((n, s) => n + (s.detail?.substances.length ?? 0), 0),
    [sections],
  );

  const handleDownloadZip = useCallback(async () => {
    if (!batchId) return;
    try {
      await downloadBatchZip(batchId);
      toast.success("ZIP ready. Download started.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ZIP download failed.");
    }
  }, [batchId]);

  if (state === "empty" || state === "error") {
    return (
      <PageContainer data-slot="batch-view-page">
        <EmptyState
          icon={FileUpIcon}
          title={state === "empty" ? "No batch selected" : "This batch is no longer available"}
          message="Upload files on the Extract page to create a batch, or open one from your history."
          action={
            <Link to="/" className={buttonVariants({ size: "lg" }) + " gap-2"}>
              <FileUpIcon className="size-4" />
              Go to Extract
            </Link>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer data-slot="batch-view-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            All extractions
          </h1>
          <p className="text-base text-foreground-muted">
            {sections.length} files · {totalStructures} structures
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            value={[view]}
            onValueChange={(v: string[]) => {
              const next = v.find((x) => x !== view);
              if (next) setView(next as View);
            }}
            aria-label="View mode"
          >
            <ToggleGroupItem value="table" aria-label="Table view" className="h-9 w-9 p-0">
              <ListIcon className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" aria-label="Grid view" className="h-9 w-9 p-0">
              <LayoutGridIcon className="size-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="primary"
            size="sm"
            className="rounded-full"
            onClick={handleDownloadZip}
            icon={<DownloadIcon />}
          >
            <span className="hidden sm:inline">Download ZIP</span>
          </Button>
        </div>
      </header>

      {state === "loading" ? (
        <div className="mt-8 space-y-8" data-slot="batch-view-loading">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {sections.map((s) => (
            <section key={s.extractionId} data-slot="batch-view-section">
              <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
                <h2 className="truncate font-mono text-base font-semibold text-foreground">
                  {s.filename}
                </h2>
                <span className="shrink-0 text-caption text-foreground-muted">
                  {s.detail ? `${s.detail.substances.length} structures` : "failed to load"}
                </span>
              </div>

              {!s.detail ? (
                <p className="mt-3 text-caption text-destructive">
                  Could not load this file's structures. Refresh to retry.
                </p>
              ) : view === "table" ? (
                <div className="mt-3">
                  <SectionTable substances={s.detail.substances} onOpen={setActive} />
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {s.detail.substances.map((sub, i) => (
                    <StructureCard
                      key={`${sub.inchi_key || sub.smiles || "x"}-${i}`}
                      substance={sub}
                      itemIndex={i}
                      onOpen={(index) => {
                        const target = s.detail?.substances[index];
                        if (target) setActive(target);
                      }}
                      depiction={DEFAULT_DEPICTION}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        {active && <StructureDetail substance={active} depiction={DEFAULT_DEPICTION} />}
      </Dialog>
    </PageContainer>
  );
}

/** Display-only table for one file's substances; maps row index to onOpen. */
function SectionTable({
  substances,
  onOpen,
}: {
  substances: SubstanceResponse[];
  onOpen: (s: SubstanceResponse) => void;
}) {
  return (
    <StructureTable
      substances={substances}
      onOpen={(index) => {
        const s = substances[index];
        if (s) onOpen(s);
      }}
      depiction={DEFAULT_DEPICTION}
    />
  );
}
