import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BatchSummary } from "./BatchSummary";
import type { BatchFileStatus } from "@/types/batch";

vi.mock("@/lib/apiClient", () => ({ downloadBatchZip: vi.fn().mockResolvedValue(undefined) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const files: BatchFileStatus[] = [
  { state: "done", filename: "a.cdx", fileSize: 1024, structureCount: 3, extractionId: 10 },
  { state: "failed", filename: "b.cdx", fileSize: 512, error: "Parse error" },
];

it("renders batch summary stats correctly", () => {
  render(
    <BatchSummary batchId="bid" files={files} totalFiles={2} totalStructures={3}
      succeededCount={1} failedCount={1} onViewExtraction={vi.fn()} onReset={vi.fn()} />
  );
  expect(screen.getByText("Batch complete")).toBeDefined();
  expect(screen.getByText("3")).toBeDefined(); // structures
  expect(screen.getByText("2")).toBeDefined(); // files
});

it("shows View link for done files only", () => {
  const onView = vi.fn();
  render(
    <BatchSummary batchId="bid" files={files} totalFiles={2} totalStructures={3}
      succeededCount={1} failedCount={1} onViewExtraction={onView} onReset={vi.fn()} />
  );
  const viewButtons = screen.getAllByText("View");
  expect(viewButtons).toHaveLength(1); // only for a.cdx (done)
  fireEvent.click(viewButtons[0]);
  expect(onView).toHaveBeenCalledWith(10);
});
