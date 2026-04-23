/**
 * ExtractPage — Phase 3 Liquid Glass wizard (Task 10 rewrite).
 *
 * Three-step wizard routed through `WizardStepper`:
 *   1. Upload  — dashed drop zone + file queue + primary CTA.
 *   2. Process — stat strip + crimson progress bar + per-file status list.
 *   3. Results — summary stats + per-file results list. A bento grid of
 *      structure tiles is rendered above the summary when the extraction
 *      surface makes them available (batch results currently live in the
 *      database and are viewed from /browse — the Results step preserves
 *      the legacy "View" link to jump there per-file).
 *
 * Step state is derived from `useExtract` and `useBatch`:
 *   - upload  → single idle   AND batch idle
 *   - process → single loading OR  batch processing
 *   - results → batch complete (single-file success auto-navigates to /browse)
 *
 * Hook signatures are untouched per the Task 10 plan; the parent still owns
 * the state and passes it down via props.
 */
import { useCallback, useMemo } from "react";
import { CheckIcon, LoaderIcon, UploadIcon } from "lucide-react";
import { BatchProgress } from "@/components/BatchProgress";
import { BatchSummary } from "@/components/BatchSummary";
import { BrandName } from "@/components/BrandName";
import { FileUpload } from "@/components/FileUpload";
import { PageContainer } from "@/components/layout/PageContainer";
import { WizardStepper, type WizardStep } from "@/components/layout/WizardStepper";
import type { BatchState } from "@/hooks/useBatch";
import type { ExtractState } from "@/hooks/useExtract";
import type { BatchFileStatus } from "@/types/batch";

export type WizardStepId = "upload" | "process" | "results";

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

const STEP_ORDER: readonly WizardStepId[] = ["upload", "process", "results"];

/**
 * Derive the active wizard step from the two hook states.
 *
 * Completed batches pin to "results". Mid-flight single/batch extractions
 * pin to "process". Everything else (idle, error, cancelled) lands on
 * "upload" so the user can retry or begin a new run.
 */
function deriveStep(
  extractState: ExtractState,
  batchState: BatchState,
): WizardStepId {
  if (batchState === "complete") return "results";
  if (extractState === "loading" || batchState === "processing") {
    return "process";
  }
  return "upload";
}

const WIZARD_STEPS: WizardStep[] = [
  { id: "upload", label: "Upload", icon: <UploadIcon className="size-4" /> },
  {
    id: "process",
    label: "Process",
    icon: <LoaderIcon className="size-4" />,
  },
  { id: "results", label: "Results", icon: <CheckIcon className="size-4" /> },
];

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
  const currentStep = useMemo(
    () => deriveStep(state, batchState),
    [state, batchState],
  );

  // Single-file path and batch path both land on "process", but BatchProgress
  // renders from `files` + `totalCount`. When a single file is extracting,
  // useBatch has not started — batchFiles is [] — so the bar was stuck at
  // "0 of 0 files, 0%, Elapsed 0s". Synthesize a 1-item pseudo-batch from the
  // selected File while useExtract is loading so the Process step has data
  // to animate against.
  const progressFiles = useMemo<BatchFileStatus[]>(() => {
    if (batchFiles.length > 0) return batchFiles;
    if (state === "loading" && selectedFile) {
      return [
        {
          state: "processing",
          filename: selectedFile.name,
          fileSize: selectedFile.size,
        },
      ];
    }
    return [];
  }, [batchFiles, state, selectedFile]);

  // Manual back-nav: any backward click in the stepper resets the batch and
  // returns to Upload. Forward clicks are ignored — forward transitions are
  // driven by hook state (useExtract / useBatch auto-advance).
  const handleStepChange = useCallback(
    (nextId: string) => {
      const nextIdx = STEP_ORDER.indexOf(nextId as WizardStepId);
      const currentIdx = STEP_ORDER.indexOf(currentStep);
      if (nextIdx < currentIdx) {
        onResetBatch();
      }
    },
    [currentStep, onResetBatch],
  );

  return (
    <PageContainer>
      <header className="mb-8 space-y-3">
        <h1 className="text-3xl text-foreground sm:text-4xl">
          <BrandName suffix="Web" />
        </h1>
        <p className="text-base text-foreground-muted">
          Extract chemical structures from ChemDraw files.
        </p>
      </header>

      <WizardStepper
        steps={WIZARD_STEPS}
        currentStep={currentStep}
        onStepChange={handleStepChange}
      >
        {currentStep === "upload" && (
          <FileUpload
            onExtract={onExtract}
            onStartBatch={onStartBatch}
            isLoading={state === "loading"}
            isBatchProcessing={false}
            loadingFilename={state === "loading" ? selectedFile?.name : undefined}
            loadingFileSize={state === "loading" ? selectedFile?.size : undefined}
          />
        )}

        {currentStep === "process" && (
          <BatchProgress
            files={progressFiles}
            totalCount={progressFiles.length}
            onCancel={onCancelBatch}
          />
        )}

        {currentStep === "results" && batchId && (
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
        )}
      </WizardStepper>
    </PageContainer>
  );
}
