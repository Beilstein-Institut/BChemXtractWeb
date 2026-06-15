/**
 * HistoryPage tests.
 *
 * Covers:
 *   - Page exposes the `history-page` data-slot.
 *   - Empty (zero extractions + zero total) renders the shared
 *     EmptyState with an "Upload a file" CTA.
 *   - Bento renders 4 StatCards with the expected labels.
 *   - Stat values are derived from entries + stats (unit tests cover
 *     the pure `computeHistoryStats` helper in detail).
 *   - StatCard.loading is true while the initial stats fetch is in
 *     flight AND no entries have been received yet.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { HistoryPage } from "./HistoryPage";
import { computeHistoryStats } from "./historyStats";
import type { HistoryListItem, StatsResponse } from "@/types/history";

const baseEntry: HistoryListItem = {
  id: 1,
  filename: "sample.cdx",
  file_size: 1024,
  format: "cdx",
  structure_count: 3,
  extraction_time_ms: 120,
  warnings: [],
  created_at: new Date().toISOString(),
  reaction_count: 1,
};

const noopToggle = () => {};
const noopDelete = async () => {};
const noopReload = async () => ({
  substances: [],
  info: { no_fragments: 0, no_inchis: 0, no_substances: 0 },
  format: "cdx" as const,
  filename: "x",
  file_size: 0,
  structure_count: 0,
  extraction_time_ms: 0,
  warnings: [],
});
const noopReloadSuccess = () => {};

describe("computeHistoryStats", () => {
  it("returns zeros when nothing has been loaded", () => {
    const out = computeHistoryStats([], null, 0);
    expect(out).toEqual({
      totalExtractions: 0,
      structuresFound: 0,
      reactionsFound: 0,
      avgProcessingTimeMs: 0,
    });
  });

  it("takes the max of stats.total_extractions, total, and entries.length", () => {
    const stats: StatsResponse = {
      total_extractions: 40,
      unique_structures: 100,
      most_common_formula: "C6H6",
    };
    const out = computeHistoryStats([baseEntry], stats, 25);
    // 40 > 25 > 1
    expect(out.totalExtractions).toBe(40);
  });

  it("prefers stats.unique_structures for Structures found when available", () => {
    const stats: StatsResponse = {
      total_extractions: 10,
      unique_structures: 42,
      most_common_formula: "",
    };
    const out = computeHistoryStats(
      [baseEntry, { ...baseEntry, id: 2, structure_count: 2 }],
      stats,
      10,
    );
    expect(out.structuresFound).toBe(42);
  });

  it("falls back to summing structure_count when stats is null", () => {
    const out = computeHistoryStats(
      [
        { ...baseEntry, structure_count: 3 },
        { ...baseEntry, id: 2, structure_count: 7 },
      ],
      null,
      2,
    );
    expect(out.structuresFound).toBe(10);
  });

  it("sums reaction_count from entries (no server total yet)", () => {
    const out = computeHistoryStats(
      [
        { ...baseEntry, reaction_count: 1 },
        { ...baseEntry, id: 2, reaction_count: 4 },
        { ...baseEntry, id: 3, reaction_count: 0 },
      ],
      null,
      3,
    );
    expect(out.reactionsFound).toBe(5);
  });

  it("averages extraction_time_ms across loaded entries", () => {
    const out = computeHistoryStats(
      [
        { ...baseEntry, extraction_time_ms: 100 },
        { ...baseEntry, id: 2, extraction_time_ms: 200 },
        { ...baseEntry, id: 3, extraction_time_ms: 300 },
      ],
      null,
      3,
    );
    expect(out.avgProcessingTimeMs).toBe(200);
  });

  it("guards against divide-by-zero on an empty entries array", () => {
    const out = computeHistoryStats([], null, 5);
    expect(out.avgProcessingTimeMs).toBe(0);
    expect(out.totalExtractions).toBe(5);
  });
});

describe("HistoryPage", () => {
  const sampleStats: StatsResponse = {
    total_extractions: 12,
    unique_structures: 25,
    most_common_formula: "C6H6",
  };

  it("renders the history-page data-slot", () => {
    const { container } = render(
      <HistoryPage
        historyState="success"
        entries={[baseEntry]}
        total={1}
        showAll={false}
        stats={sampleStats}
        statsLoading={false}
        onToggleShowAll={noopToggle}
        onReload={noopReload}
        onDelete={noopDelete}
        onReloadSuccess={noopReloadSuccess}
      />,
    );
    expect(container.querySelector('[data-slot="history-page"]')).not.toBeNull();
  });

  it("renders empty state with CTA when zero extractions", () => {
    render(
      <HistoryPage
        historyState="success"
        entries={[]}
        total={0}
        showAll={false}
        stats={null}
        statsLoading={false}
        onToggleShowAll={noopToggle}
        onReload={noopReload}
        onDelete={noopDelete}
        onReloadSuccess={noopReloadSuccess}
      />,
    );
    expect(screen.getByText("No extractions yet")).toBeInTheDocument();
    expect(screen.getByText("Upload a file")).toBeInTheDocument();
  });

  it("renders four stat bento cells with expected labels", () => {
    const { container } = render(
      <HistoryPage
        historyState="success"
        entries={[baseEntry]}
        total={1}
        showAll={false}
        stats={sampleStats}
        statsLoading={false}
        onToggleShowAll={noopToggle}
        onReload={noopReload}
        onDelete={noopDelete}
        onReloadSuccess={noopReloadSuccess}
      />,
    );
    expect(container.querySelector('[data-slot="history-stats"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="history-stat-total"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="history-stat-structures"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="history-stat-reactions"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="history-stat-avg-time"]')).not.toBeNull();

    expect(screen.getByText("Total extractions")).toBeInTheDocument();
    expect(screen.getByText("Structures found")).toBeInTheDocument();
    expect(screen.getByText("Reactions found")).toBeInTheDocument();
    expect(screen.getByText("Avg processing time")).toBeInTheDocument();
  });

  it("renders the list heading when entries are present", () => {
    render(
      <HistoryPage
        historyState="success"
        entries={[baseEntry]}
        total={1}
        showAll={false}
        stats={sampleStats}
        statsLoading={false}
        onToggleShowAll={noopToggle}
        onReload={noopReload}
        onDelete={noopDelete}
        onReloadSuccess={noopReloadSuccess}
      />,
    );
    expect(screen.getByText("Recent extractions")).toBeInTheDocument();
  });

  it("shows stat skeletons while initial stats fetch is in flight", () => {
    const { container } = render(
      <HistoryPage
        historyState="loading"
        entries={[]}
        total={1}
        showAll={false}
        stats={null}
        statsLoading={true}
        onToggleShowAll={noopToggle}
        onReload={noopReload}
        onDelete={noopDelete}
        onReloadSuccess={noopReloadSuccess}
      />,
    );
    // Skeletons use data-loading="true" on the stat-card slot.
    const skeletons = container.querySelectorAll('[data-slot="stat-card"][data-loading="true"]');
    expect(skeletons.length).toBe(4);
  });

  it("computes stats from entries when server stats have not arrived yet", () => {
    const { container } = render(
      <HistoryPage
        historyState="success"
        entries={[
          { ...baseEntry, structure_count: 4, reaction_count: 2 },
          {
            ...baseEntry,
            id: 2,
            structure_count: 6,
            reaction_count: 1,
            extraction_time_ms: 240,
          },
        ]}
        total={2}
        showAll={false}
        stats={null}
        statsLoading={false}
        onToggleShowAll={noopToggle}
        onReload={noopReload}
        onDelete={noopDelete}
        onReloadSuccess={noopReloadSuccess}
      />,
    );
    // Structures = 4 + 6 = 10, Reactions = 2 + 1 = 3.
    // Total extractions = max(stats:0, total:2, entries.length:2) = 2.
    const total = container.querySelector(
      '[data-slot="history-stat-total"] [data-slot="stat-card-value"]',
    );
    const structures = container.querySelector(
      '[data-slot="history-stat-structures"] [data-slot="stat-card-value"]',
    );
    const reactions = container.querySelector(
      '[data-slot="history-stat-reactions"] [data-slot="stat-card-value"]',
    );
    expect(total?.textContent).toBe("2");
    expect(structures?.textContent).toBe("10");
    expect(reactions?.textContent).toBe("3");
  });

  it("does not crash when only statsLoading + statsLoading prop is true with zero state", () => {
    const spy = vi.fn();
    // Smoke test to ensure we render even when every optional input is empty.
    expect(() => {
      render(
        <HistoryPage
          historyState="idle"
          entries={[]}
          total={0}
          showAll={false}
          stats={null}
          statsLoading={true}
          onToggleShowAll={spy}
          onReload={noopReload}
          onDelete={noopDelete}
          onReloadSuccess={noopReloadSuccess}
        />,
      );
    }).not.toThrow();
  });
});
