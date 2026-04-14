import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BatchProgress } from "./BatchProgress";
import type { BatchFileStatus } from "@/types/batch";

const files: BatchFileStatus[] = [
  { state: "done", filename: "a.cdx", fileSize: 1024, structureCount: 5, extractionId: 1 },
  { state: "failed", filename: "b.cdx", fileSize: 512, error: "Parse error" },
  { state: "queued", filename: "c.cdx", fileSize: 2048 },
];

it("renders per-file status rows", () => {
  render(<BatchProgress files={files} completedCount={1} totalCount={3} onCancel={vi.fn()} />);
  expect(screen.getByText("a.cdx")).toBeDefined();
  expect(screen.getByText("5 structures")).toBeDefined();
  expect(screen.getByText("b.cdx")).toBeDefined();
  expect(screen.getByText(/Parse error/)).toBeDefined();
  expect(screen.getByText("c.cdx")).toBeDefined();
});

it("shows Cancel batch button", () => {
  render(<BatchProgress files={[]} completedCount={0} totalCount={0} onCancel={vi.fn()} />);
  expect(screen.getByText("Cancel batch")).toBeDefined();
});
