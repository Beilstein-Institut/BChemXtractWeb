/**
 * ExtractPage — file upload + extraction flow (route: `/`).
 *
 * Owns the upload UI. On successful extraction the user is redirected to
 * `/browse` by App's success-useEffect, so this page only renders the
 * upload states (idle, loading, batch processing, batch complete).
 */
import { BatchProgress } from "@/components/BatchProgress";
import { BatchSummary } from "@/components/BatchSummary";
import { FileUpload } from "@/components/FileUpload";
import type { BatchState } from "@/hooks/useBatch";
import type { ExtractState } from "@/hooks/useExtract";
import type { BatchFileStatus } from "@/types/batch";

export interface ExtractPageProps {
  state: ExtractState;
  selectedFile: File | null;
  onExtract: (file: File) => void;

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
  onExtract,
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
  const showUpload = batchState !== "processing" && state !== "success";
  const isLoading = state === "loading";

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

      {showUpload && (
        <div className="mt-12">
          <FileUpload
            mode="batch"
            onExtract={onExtract}
            onStartBatch={onStartBatch}
            isLoading={isLoading}
            isBatchProcessing={false}
            loadingFilename={isLoading ? selectedFile?.name : undefined}
            loadingFileSize={isLoading ? selectedFile?.size : undefined}
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
    </>
  );
}
