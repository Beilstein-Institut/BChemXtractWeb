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
      <BatchProgress
        files={files}
        completedCount={1}
        totalCount={3}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("a.cdx")).toBeDefined();
    expect(screen.getByText("5 structures")).toBeDefined();
    expect(screen.getByText("b.cdx")).toBeDefined();
    expect(screen.getByText(/Parse error/)).toBeDefined();
    expect(screen.getByText("c.cdx")).toBeDefined();
  });

  it("shows Cancel batch button", () => {
    render(
      <BatchProgress
        files={[]}
        completedCount={0}
        totalCount={0}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Cancel batch")).toBeDefined();
  });

  it("renders the 3-up stat strip with Total / Completed / Failed labels", () => {
    render(
      <BatchProgress
        files={files}
        completedCount={2}
        totalCount={3}
        onCancel={vi.fn()}
      />,
    );
    const stats = document.querySelector("[data-slot='batch-stats']");
    expect(stats).not.toBeNull();
    expect(screen.getByText("Total")).toBeDefined();
    expect(screen.getByText("Completed")).toBeDefined();
    expect(screen.getByText("Failed")).toBeDefined();
  });

  it("renders the process-step root slot and file-progress-list", () => {
    render(
      <BatchProgress
        files={files}
        completedCount={1}
        totalCount={3}
        onCancel={vi.fn()}
      />,
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
      <BatchProgress
        files={files}
        completedCount={1}
        totalCount={3}
        onCancel={vi.fn()}
      />,
    );
    const nameEl = screen.getByText("a.cdx");
    expect(nameEl.className).toMatch(/font-mono/);
  });
});
