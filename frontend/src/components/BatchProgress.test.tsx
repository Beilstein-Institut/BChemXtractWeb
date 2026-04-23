import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BatchProgress } from "./BatchProgress";
import type { BatchFileStatus } from "@/types/batch";

const files: BatchFileStatus[] = [
  {
    state: "done",
    filename: "a.cdx",
    fileSize: 1024,
    structureCount: 5,
    extractionId: 1,
  },
  { state: "failed", filename: "b.cdx", fileSize: 512, error: "Parse error" },
  { state: "queued", filename: "c.cdx", fileSize: 2048 },
];

describe("BatchProgress", () => {
  it("renders per-file status rows", () => {
    render(
      <BatchProgress files={files} totalCount={3} onCancel={vi.fn()} />,
    );
    expect(screen.getByText("a.cdx")).toBeDefined();
    expect(screen.getByText("5 structures")).toBeDefined();
    expect(screen.getByText("b.cdx")).toBeDefined();
    expect(screen.getByText(/Parse error/)).toBeDefined();
    expect(screen.getByText("c.cdx")).toBeDefined();
  });

  it("shows Cancel batch button", () => {
    render(<BatchProgress files={[]} totalCount={0} onCancel={vi.fn()} />);
    expect(screen.getByText("Cancel batch")).toBeDefined();
  });

  it("renders the 3-up stat strip with Total / Completed / Failed labels", () => {
    render(
      <BatchProgress files={files} totalCount={3} onCancel={vi.fn()} />,
    );
    const stats = document.querySelector("[data-slot='batch-stats']");
    expect(stats).not.toBeNull();
    expect(screen.getByText("Total")).toBeDefined();
    expect(screen.getByText("Completed")).toBeDefined();
    expect(screen.getByText("Failed")).toBeDefined();
  });

  it("renders the process-step root slot and file-progress-list", () => {
    render(
      <BatchProgress files={files} totalCount={3} onCancel={vi.fn()} />,
    );
    expect(
      document.querySelector("[data-slot='process-step']"),
    ).not.toBeNull();
    expect(
      document.querySelector("[data-slot='file-progress-list']"),
    ).not.toBeNull();
  });

  it("file names use Geist Mono (font-mono class)", () => {
    render(
      <BatchProgress files={files} totalCount={3} onCancel={vi.fn()} />,
    );
    const nameEl = screen.getByText("a.cdx");
    expect(nameEl.className).toMatch(/font-mono/);
  });

  it("progress bar reflects processed count (done + failed), not done-only", () => {
    // 1 done + 1 failed + 1 queued out of 3 total -> 2/3 processed ~= 67%.
    // The old behaviour advanced only on done, which would stall the bar
    // at 1/3 = 33% even though the worker had finished 2 of 3 files.
    const { container } = render(
      <BatchProgress files={files} totalCount={3} onCancel={vi.fn()} />,
    );
    // Indicator width should be ~66.67% (2 processed out of 3).
    const indicator = container.querySelector(
      '[data-slot="progress-indicator"]',
    ) as HTMLElement;
    expect(indicator.style.width.startsWith("66.6")).toBe(true);
    // The ProgressLabel mirrors the processed count.
    expect(screen.getByText("2 of 3 files")).toBeDefined();
    // The ProgressValue rounds to 67%.
    expect(screen.getByText("67%")).toBeDefined();
  });

  it("Completed stat still reflects succeeded-only count (not processed)", () => {
    render(
      <BatchProgress files={files} totalCount={3} onCancel={vi.fn()} />,
    );
    // files fixture has 1 done + 1 failed. Completed cell should show 1,
    // Failed cell should show 1, Total 3 — the stat strip is a
    // different semantic than the progress bar.
    const statCells = document.querySelectorAll("[data-slot='batch-stat']");
    expect(statCells.length).toBe(3);
    const totalCell = statCells[0] as HTMLElement;
    const completedCell = statCells[1] as HTMLElement;
    const failedCell = statCells[2] as HTMLElement;
    expect(totalCell.textContent).toContain("3");
    expect(completedCell.textContent).toContain("1");
    expect(failedCell.textContent).toContain("1");
  });
});
