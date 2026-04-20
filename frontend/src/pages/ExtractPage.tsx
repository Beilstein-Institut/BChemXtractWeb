/**
 * ExtractPage — file upload + extraction flow (route: `/`).
 *
 * Owns the upload UI and post-extraction summary. After a successful
 * extraction, shows a "Browse structures" CTA that routes to /browse.
 * State stays in App.tsx; this page is a presentational slice.
 */
import { ArrowRightIcon } from "lucide-react";
import { FileUpload } from "@/components/FileUpload";
import { BatchProgress } from "@/components/BatchProgress";
import { BatchSummary } from "@/components/BatchSummary";
import { ExtractionSummary } from "@/components/ExtractionSummary";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/Link";
import type { ExtractionResponse } from "@/types/chemistry";
import type { BatchFileStatus } from "@/types/batch";
import type { ExtractState } from "@/hooks/useExtract";
import type { BatchState } from "@/hooks/useBatch";

export interface ExtractPageProps {
  state: ExtractState;
  selectedFile: File | null;
  result: ExtractionResponse | null;
  historicalResult: ExtractionResponse | null;
  onExtract: (file: File) => void;
  onReset: () => void;

  batchState: BatchState;
  batchFiles: BatchFileStatus[];
  batchId: string | null;
  batchCompletedCount: number;
  batchFailedCount: number;
  batchTotalStructures: number;
  onStartBatch: (files: File[]) => void;
  onCancelBatch: () => void;
  onResetBatch: () => void;

  onViewExtraction: (extractionId: number) => void;
}

export function ExtractPage({
  state,
  selectedFile,
  result,
  historicalResult,
  onExtract,
  onReset,
  batchState,
  batchFiles,
  batchId,
  batchCompletedCount,
  batchFailedCount,
  batchTotalStructures,
  onStartBatch,
  onCancelBatch,
  onResetBatch,
  onViewExtraction,
}: ExtractPageProps) {
  const activeResult = historicalResult ?? result;
  const showSummary = (state === "success" && result !== null) || historicalResult !== null;

  return (
    <>
      <header className="pt-2">
        <h1 className="text-display font-semibold leading-[1.10] tracking-tight">
          BChemXtractWeb
        </h1>
        <p className="mt-4 text-sub-heading font-normal text-muted-foreground tracking-tight">
          Extract chemical structures from ChemDraw files.
        </p>
      </header>

      {(state === "idle" || state === "error") && batchState !== "processing" && (
        <div className="mt-12">
          <FileUpload
            mode="batch"
            onExtract={onExtract}
            onStartBatch={onStartBatch}
            isLoading={false}
            isBatchProcessing={false}
          />
        </div>
      )}

      {state === "loading" && (
        <div className="mt-12">
          <FileUpload
            mode="batch"
            onExtract={onExtract}
            onStartBatch={onStartBatch}
            isLoading={true}
            isBatchProcessing={false}
            loadingFilename={selectedFile?.name}
            loadingFileSize={selectedFile?.size}
          />
        </div>
      )}

      {batchState === "processing" && (
        <div className="mt-12">
          <BatchProgress
            files={batchFiles}
            completedCount={batchCompletedCount}
            totalCount={batchFiles.length}
            onCancel={onCancelBatch}
          />
        </div>
      )}

      {batchState === "complete" && batchId && (
        <div className="mt-8">
          <BatchSummary
            batchId={batchId}
            files={batchFiles}
            totalFiles={batchFiles.length}
            totalStructures={batchTotalStructures}
            succeededCount={batchCompletedCount}
            failedCount={batchFailedCount}
            onViewExtraction={onViewExtraction}
            onReset={onResetBatch}
          />
        </div>
      )}

      {showSummary && activeResult !== null && (
        <div className="mt-8 space-y-4">
          <ExtractionSummary response={activeResult} onReset={onReset} />
          {activeResult.extraction_id && (
            <div className="flex flex-wrap gap-3">
              <Link
                to="/browse"
                className={buttonVariants({ size: "lg" }) + " gap-2"}
              >
                Browse structures
                <ArrowRightIcon className="size-4" />
              </Link>
              <Link
                to="/history"
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                Open history
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
