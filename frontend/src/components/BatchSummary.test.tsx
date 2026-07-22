import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BatchSummary } from "./BatchSummary";
import type { BatchFileStatus } from "@/types/batch";

vi.mock("@/lib/apiClient", () => ({
  downloadBatchZip: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/router", () => ({ navigate: vi.fn() }));
import { navigate } from "@/lib/router";

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

  it("renders the persisted results view for a completed batch", () => {
    // R1 regression guard: after a batch completes the Extract page must STAY
    // on the batch-results view (not navigate away). This asserts that
    // BatchSummary — the persisted results surface — mounts both the
    // "Batch complete" heading AND the per-file structure counts from the file
    // list, confirming the full results step is rendered rather than unmounted
    // or replaced.
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
    // Heading confirms the results step is mounted (not navigated away)
    expect(screen.getByText("Batch complete")).toBeDefined();
    // Per-file structure count in the file list — only present when the done
    // row renders; "3 structures" comes from files[0] (a.cdx, structureCount=3).
    // Scoped to the list slot because the callout's "View all 3 structures"
    // button also contains that substring.
    const list = document.querySelector("[data-slot='batch-summary-list']");
    expect(list?.textContent).toMatch(/3 structures/i);
  });

  it("shows a positive callout when every file succeeded", () => {
    render(
      <BatchSummary
        batchId="bid"
        files={[files[0]]}
        totalFiles={1}
        totalStructures={3}
        succeededCount={1}
        failedCount={0}
        onViewExtraction={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    const callout = document.querySelector("[data-slot='batch-summary-callout']");
    expect(callout?.textContent).toMatch(/All 3 structures extracted/i);
    // The full-width View-all CTA is present and counts the structures.
    expect(screen.getByRole("button", { name: /view all 3 structures/i })).toBeDefined();
  });

  it("shows a neutral 'N of M files extracted' callout when some files failed", () => {
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
    const callout = document.querySelector("[data-slot='batch-summary-callout']");
    expect(callout?.textContent).toMatch(/1 of 2 files extracted/i);
  });

  it("hides the View-all CTA when the batch produced no structures", () => {
    render(
      <BatchSummary
        batchId="bid"
        files={[{ state: "failed", filename: "b.cdx", fileSize: 512, error: "Parse error" }]}
        totalFiles={1}
        totalStructures={0}
        succeededCount={0}
        failedCount={1}
        onViewExtraction={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /view all/i })).toBeNull();
  });

  it("navigates to the combined batch view when View all is clicked", () => {
    render(
      <BatchSummary
        {...{
          batchId: "b42",
          files,
          totalFiles: 2,
          totalStructures: 3,
          succeededCount: 1,
          failedCount: 1,
          onViewExtraction: vi.fn(),
          onReset: vi.fn(),
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /view all/i }));
    expect(navigate).toHaveBeenCalledWith("/batch?batch=b42");
  });
});
