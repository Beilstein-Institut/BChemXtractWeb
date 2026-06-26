import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, vi } from "vitest";
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
    render(<BatchProgress files={files} totalCount={3} onCancel={vi.fn()} />);
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

  it("Stop batch calls onCancel and dismisses the dialog immediately", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<BatchProgress files={files} totalCount={3} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Cancel batch" }));
    const stop = await screen.findByRole("button", { name: "Stop batch" });
    await user.click(stop);

    expect(onCancel).toHaveBeenCalledTimes(1);
    // Dialog must close on click, not wait for the async cancel to settle.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop batch" })).toBeNull());
  });

  it("renders the 3-up stat strip with Total / Completed / Failed labels", () => {
    render(<BatchProgress files={files} totalCount={3} onCancel={vi.fn()} />);
    const stats = document.querySelector("[data-slot='batch-stats']");
    expect(stats).not.toBeNull();
    expect(screen.getByText("Total")).toBeDefined();
    expect(screen.getByText("Completed")).toBeDefined();
    expect(screen.getByText("Failed")).toBeDefined();
  });

  it("renders the process-step root slot and file-progress-list", () => {
    render(<BatchProgress files={files} totalCount={3} onCancel={vi.fn()} />);
    expect(document.querySelector("[data-slot='process-step']")).not.toBeNull();
    expect(document.querySelector("[data-slot='file-progress-list']")).not.toBeNull();
  });

  it("file names use Geist Mono (font-mono class)", () => {
    render(<BatchProgress files={files} totalCount={3} onCancel={vi.fn()} />);
    const nameEl = screen.getByText("a.cdx");
    expect(nameEl.className).toMatch(/font-mono/);
  });

  it("progress bar reflects processed count (done + failed), not done-only", () => {
    // 1 done + 1 failed + 1 queued out of 3 total -> 2/3 processed ~= 67%.
    // The old behaviour advanced only on done, which would stall the bar
    // at 1/3 = 33% even though the worker had finished 2 of 3 files.
    const { container } = render(<BatchProgress files={files} totalCount={3} onCancel={vi.fn()} />);
    // Indicator width should be ~66.67% (2 processed out of 3).
    const indicator = container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    expect(indicator.style.width.startsWith("66.6")).toBe(true);
    // The ProgressLabel mirrors the processed count.
    expect(screen.getByText("2 of 3 files")).toBeDefined();
    // The ProgressValue rounds to 67%.
    expect(screen.getByText("67%")).toBeDefined();
  });

  it("Completed stat still reflects succeeded-only count (not processed)", () => {
    render(<BatchProgress files={files} totalCount={3} onCancel={vi.fn()} />);
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

  describe("elapsed timer", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("renders the elapsed slot and starts at 0s while the batch is in flight", () => {
      vi.useFakeTimers();
      const inFlight: BatchFileStatus[] = [
        { state: "processing", filename: "a.cdx", fileSize: 1024 },
        { state: "queued", filename: "b.cdx", fileSize: 2048 },
      ];
      const { container } = render(
        <BatchProgress files={inFlight} totalCount={2} onCancel={vi.fn()} />,
      );
      const elapsed = container.querySelector("[data-slot='batch-elapsed']") as HTMLElement;
      expect(elapsed).not.toBeNull();
      expect(elapsed.textContent).toContain("Elapsed:");
      expect(elapsed.textContent).toContain("0s");
    });

    it("ticks seconds while the batch is processing (< 60s renders Ns)", () => {
      vi.useFakeTimers();
      const inFlight: BatchFileStatus[] = [
        { state: "processing", filename: "a.cdx", fileSize: 1024 },
        { state: "queued", filename: "b.cdx", fileSize: 2048 },
      ];
      const { container } = render(
        <BatchProgress files={inFlight} totalCount={2} onCancel={vi.fn()} />,
      );
      act(() => {
        vi.advanceTimersByTime(12_000);
      });
      const elapsed = container.querySelector("[data-slot='batch-elapsed']") as HTMLElement;
      expect(elapsed.textContent).toContain("12s");
    });

    it("formats >= 60s as m:ss", () => {
      vi.useFakeTimers();
      const inFlight: BatchFileStatus[] = [
        { state: "processing", filename: "a.cdx", fileSize: 1024 },
      ];
      const { container } = render(
        <BatchProgress files={inFlight} totalCount={1} onCancel={vi.fn()} />,
      );
      act(() => {
        vi.advanceTimersByTime(83_000); // 1:23
      });
      const elapsed = container.querySelector("[data-slot='batch-elapsed']") as HTMLElement;
      expect(elapsed.textContent).toContain("1:23");
    });

    it("stops ticking once every file is processed", () => {
      vi.useFakeTimers();
      const done: BatchFileStatus[] = [
        {
          state: "done",
          filename: "a.cdx",
          fileSize: 1024,
          structureCount: 2,
          extractionId: 1,
        },
      ];
      const { container } = render(
        <BatchProgress files={done} totalCount={1} onCancel={vi.fn()} />,
      );
      const elapsed = container.querySelector("[data-slot='batch-elapsed']") as HTMLElement;
      const initial = elapsed.textContent;
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      // Completed batch: the counter must NOT advance.
      expect(elapsed.textContent).toBe(initial);
    });
  });

  describe("pipeline phase line", () => {
    it("renders for single-file extractions while the timer is active", () => {
      const processing: BatchFileStatus[] = [
        { state: "processing", filename: "drug.cdx", fileSize: 1024 },
      ];
      const { container } = render(
        <BatchProgress files={processing} totalCount={1} onCancel={vi.fn()} />,
      );
      const phase = container.querySelector("[data-slot='batch-pipeline-phase']");
      expect(phase).not.toBeNull();
      expect(phase?.textContent).toBe("Reading the CDX/CDXML file");
    });

    it("does not render for real batches (totalCount > 1)", () => {
      // Per-file rows already give the user something to track during real
      // batches; a rotating tagline competes for attention.
      const { container } = render(
        <BatchProgress files={files} totalCount={3} onCancel={vi.fn()} />,
      );
      expect(container.querySelector("[data-slot='batch-pipeline-phase']")).toBeNull();
    });

    it("does not render once the single-file extraction completes", () => {
      const done: BatchFileStatus[] = [
        {
          state: "done",
          filename: "drug.cdx",
          fileSize: 1024,
          structureCount: 2,
          extractionId: 1,
        },
      ];
      const { container } = render(
        <BatchProgress files={done} totalCount={1} onCancel={vi.fn()} />,
      );
      expect(container.querySelector("[data-slot='batch-pipeline-phase']")).toBeNull();
    });
  });
});
