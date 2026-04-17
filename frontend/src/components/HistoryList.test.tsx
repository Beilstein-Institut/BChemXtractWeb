import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryList } from "./HistoryList";
import type { HistoryListItem } from "@/types/history";

const mockEntry: HistoryListItem = {
  id: 1,
  filename: "test.cdx",
  file_size: 1024,
  format: "cdx",
  structure_count: 3,
  extraction_time_ms: 120.5,
  warnings: [],
  created_at: new Date().toISOString(),
};

const noop = async () => {};
const noopSync = () => {};

describe("HistoryList", () => {
  it("renders shared EmptyState when empty and not loading (D-19)", () => {
    render(
      <HistoryList
        entries={[]}
        total={0}
        loading={false}
        showAll={false}
        onToggleShowAll={noopSync}
        onReload={async () => ({
          substances: [],
          info: { no_fragments: 0, no_inchis: 0, no_substances: 0 },
          format: "cdx",
          filename: "test.cdx",
          file_size: 0,
          structure_count: 0,
          extraction_time_ms: 0,
          warnings: [],
        })}
        onDelete={noop}
        onReloadSuccess={noopSync}
      />,
    );
    // Phase 9 D-19: previously returned null; now renders shared EmptyState
    // with compact variant so "upload a file" cue is always visible.
    expect(screen.getByText("No extractions yet")).toBeInTheDocument();
    expect(screen.getByText("Upload a CDX or CDXML file to get started.")).toBeInTheDocument();
  });

  it("renders 'Recent Extractions' heading when entries exist", () => {
    render(
      <HistoryList
        entries={[mockEntry]}
        total={1}
        loading={false}
        showAll={false}
        onToggleShowAll={noopSync}
        onReload={async () => ({
          substances: [],
          info: { no_fragments: 0, no_inchis: 0, no_substances: 0 },
          format: "cdx",
          filename: "test.cdx",
          file_size: 0,
          structure_count: 0,
          extraction_time_ms: 0,
          warnings: [],
        })}
        onDelete={noop}
        onReloadSuccess={noopSync}
      />,
    );
    expect(screen.getByText("Recent Extractions")).toBeTruthy();
  });

  it("renders skeleton rows while loading", () => {
    const { container } = render(
      <HistoryList
        entries={[]}
        total={1}
        loading={true}
        showAll={false}
        onToggleShowAll={noopSync}
        onReload={async () => ({
          substances: [],
          info: { no_fragments: 0, no_inchis: 0, no_substances: 0 },
          format: "cdx",
          filename: "test.cdx",
          file_size: 0,
          structure_count: 0,
          extraction_time_ms: 0,
          warnings: [],
        })}
        onDelete={noop}
        onReloadSuccess={noopSync}
      />,
    );
    // Loading state: skeleton divs rendered instead of empty null
    expect(container.querySelector("section")).toBeTruthy();
  });

  it("shows 'Show all' button when total > 10", () => {
    const manyEntries = Array.from({ length: 10 }, (_, i) => ({
      ...mockEntry,
      id: i + 1,
      filename: `file${i}.cdx`,
    }));
    render(
      <HistoryList
        entries={manyEntries}
        total={25}
        loading={false}
        showAll={false}
        onToggleShowAll={noopSync}
        onReload={async () => ({
          substances: [],
          info: { no_fragments: 0, no_inchis: 0, no_substances: 0 },
          format: "cdx",
          filename: "test.cdx",
          file_size: 0,
          structure_count: 0,
          extraction_time_ms: 0,
          warnings: [],
        })}
        onDelete={noop}
        onReloadSuccess={noopSync}
      />,
    );
    expect(screen.getByText(/Show all 25 extractions/)).toBeTruthy();
  });
});
