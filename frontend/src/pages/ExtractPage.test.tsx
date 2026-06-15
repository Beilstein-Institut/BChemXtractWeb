/**
 * Tests for ExtractPage — wizard shell.
 *
 * Focuses on the step derivation and wizard scaffolding. The inner
 * composites (FileUpload / BatchProgress / BatchSummary) have their own
 * unit tests; here we assert the wizard mounts the right one per
 * hook-state permutation.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ExtractPage } from "./ExtractPage";
import type { BatchFileStatus } from "@/types/batch";

vi.mock("@/lib/apiClient", () => ({
  downloadBatchZip: vi.fn(),
  postExtract: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn() },
}));

const emptyProps = {
  state: "idle" as const,
  selectedFile: null,
  onExtract: vi.fn(),
  batchState: "idle" as const,
  batchFiles: [] as BatchFileStatus[],
  batchId: null,
  batchCompletedCount: 0,
  batchFailedCount: 0,
  batchTotalStructures: 0,
  onStartBatch: vi.fn(),
  onCancelBatch: vi.fn(),
  onResetBatch: vi.fn(),
  onViewExtraction: vi.fn(),
};

describe("ExtractPage wizard", () => {
  it("renders inside a PageContainer with data-slot='page-container'", () => {
    render(<ExtractPage {...emptyProps} />);
    expect(document.querySelector("[data-slot='page-container']")).not.toBeNull();
  });

  it("renders the WizardStepper", () => {
    render(<ExtractPage {...emptyProps} />);
    expect(document.querySelector("[data-slot='wizard-stepper']")).not.toBeNull();
  });

  it("starts on the Upload step when both hooks are idle", () => {
    render(<ExtractPage {...emptyProps} />);
    const root = document.querySelector("[data-slot='wizard-stepper']") as HTMLElement;
    expect(root.dataset.current).toBe("upload");
    expect(document.querySelector("[data-slot='upload-step']")).not.toBeNull();
  });

  it("advances to Process step when single extraction is loading", () => {
    render(<ExtractPage {...emptyProps} state="loading" />);
    const root = document.querySelector("[data-slot='wizard-stepper']") as HTMLElement;
    expect(root.dataset.current).toBe("process");
  });

  it("advances to Process step when batch is processing", () => {
    const files: BatchFileStatus[] = [{ state: "queued", filename: "a.cdx", fileSize: 1024 }];
    render(<ExtractPage {...emptyProps} batchState="processing" batchFiles={files} />);
    const root = document.querySelector("[data-slot='wizard-stepper']") as HTMLElement;
    expect(root.dataset.current).toBe("process");
    expect(document.querySelector("[data-slot='process-step']")).not.toBeNull();
  });

  it("advances to Results step when batch completes", () => {
    const files: BatchFileStatus[] = [
      {
        state: "done",
        filename: "a.cdx",
        fileSize: 1024,
        structureCount: 5,
        extractionId: 7,
      },
    ];
    render(
      <ExtractPage
        {...emptyProps}
        batchState="complete"
        batchFiles={files}
        batchId="bid-1"
        batchCompletedCount={1}
        batchTotalStructures={5}
      />,
    );
    const root = document.querySelector("[data-slot='wizard-stepper']") as HTMLElement;
    expect(root.dataset.current).toBe("results");
    expect(document.querySelector("[data-slot='results-step']")).not.toBeNull();
    expect(screen.getByText("Batch complete")).toBeInTheDocument();
  });

  it("surfaces the three step labels", () => {
    render(<ExtractPage {...emptyProps} />);
    expect(screen.getByText("Upload")).toBeInTheDocument();
    expect(screen.getByText("Process")).toBeInTheDocument();
    expect(screen.getByText("Results")).toBeInTheDocument();
  });
});
