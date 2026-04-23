import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BatchSummary } from "./BatchSummary";
import type { BatchFileStatus } from "@/types/batch";

vi.mock("@/lib/apiClient", () => ({
  downloadBatchZip: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const files: BatchFileStatus[] = [
  {
    state: "done",
    filename: "a.cdx",
    fileSize: 1024,
    structureCount: 3,
    extractionId: 10,
  },
  { state: "failed", filename: "b.cdx", fileSize: 512, error: "Parse error" },
];

describe("BatchSummary", () => {
  it("renders the results-step root slot", () => {
    render(
      <BatchSummary
        batchId="bid"
        files={files}
        totalFiles={2}
        totalStructures={3}
        succeededCount={1}
        failedCount={1}
        onViewExtraction={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(document.querySelector("[data-slot='results-step']")).not.toBeNull();
  });

  it("renders batch summary stats correctly", () => {
    render(
      <BatchSummary
        batchId="bid"
        files={files}
        totalFiles={2}
        totalStructures={3}
        succeededCount={1}
        failedCount={1}
        onViewExtraction={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByText("Batch complete")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined(); // structures
    // Multiple 2s in DOM (files=2 + failedCount could show as count), use stats slot
    const stats = document.querySelector("[data-slot='batch-summary-stats']");
    expect(stats?.textContent).toContain("Files");
    expect(stats?.textContent).toContain("Structures");
    expect(stats?.textContent).toContain("Succeeded");
    expect(stats?.textContent).toContain("Failed");
  });

  it("shows View link for done files only", () => {
    const onView = vi.fn();
    render(
      <BatchSummary
        batchId="bid"
        files={files}
        totalFiles={2}
        totalStructures={3}
        succeededCount={1}
        failedCount={1}
        onViewExtraction={onView}
        onReset={vi.fn()}
      />,
    );
    const viewButtons = screen.getAllByRole("button", { name: "View" });
    expect(viewButtons).toHaveLength(1); // only for a.cdx (done)
    fireEvent.click(viewButtons[0]);
    expect(onView).toHaveBeenCalledWith(10);
  });

  it("file rows use Geist Mono for filenames", () => {
    render(
      <BatchSummary
        batchId="bid"
        files={files}
        totalFiles={2}
        totalStructures={3}
        succeededCount={1}
        failedCount={1}
        onViewExtraction={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    const el = screen.getByText("a.cdx");
    expect(el.className).toMatch(/font-mono/);
  });

  it("New batch button fires onReset", () => {
    const onReset = vi.fn();
    render(
      <BatchSummary
        batchId="bid"
        files={files}
        totalFiles={2}
        totalStructures={3}
        succeededCount={1}
        failedCount={1}
        onViewExtraction={vi.fn()}
        onReset={onReset}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "New batch" }));
    expect(onReset).toHaveBeenCalled();
  });
});
