/**
 * Tests for HistoryEntry reaction-count chip (Plan 10-05 Task 5.2 / D-23).
 *
 * Verifies that the metadata line:
 *   - renders "{N} substances · {relTime}" when reaction_count === 0
 *   - renders "{N} substances · {M} reactions · {relTime}" when reaction_count > 0
 *   - uses singular "reaction" when reaction_count === 1
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryEntry } from "./HistoryEntry";
import type { HistoryListItem } from "@/types/history";

const mkEntry = (
  overrides: Partial<HistoryListItem> = {},
): HistoryListItem => ({
  id: 1,
  filename: "test.cdx",
  file_size: 100,
  format: "cdx",
  structure_count: 12,
  extraction_time_ms: 500,
  warnings: [],
  created_at: new Date(Date.now() - 60_000).toISOString(),
  reaction_count: 0,
  ...overrides,
});

const noopAsync = async () => {};

describe("HistoryEntry — reaction_count chip (Plan 10 D-23)", () => {
  it("reaction_count === 0 does NOT render a reactions segment", () => {
    render(
      <HistoryEntry
        entry={mkEntry()}
        onReload={noopAsync}
        onDelete={noopAsync}
      />,
    );
    // "12 substances · {relTime}" — no "reactions" text
    expect(screen.getByText(/12 substances/)).toBeInTheDocument();
    expect(screen.queryByText(/reaction[s]?\s*·/i)).toBeNull();
  });

  it("reaction_count === 3 renders '12 substances · 3 reactions · {time}'", () => {
    render(
      <HistoryEntry
        entry={mkEntry({ reaction_count: 3 })}
        onReload={noopAsync}
        onDelete={noopAsync}
      />,
    );
    expect(screen.getByText(/12 substances/)).toBeInTheDocument();
    expect(screen.getByText(/3 reactions/)).toBeInTheDocument();
  });

  it("reaction_count === 1 renders singular 'reaction' (not 'reactions')", () => {
    render(
      <HistoryEntry
        entry={mkEntry({ reaction_count: 1 })}
        onReload={noopAsync}
        onDelete={noopAsync}
      />,
    );
    // "1 reaction " (with space/separator after, NOT "reactions")
    expect(screen.getByText(/1 reaction(?!s)/)).toBeInTheDocument();
  });

  it("structure_count === 1 pluralises correctly (singular)", () => {
    render(
      <HistoryEntry
        entry={mkEntry({ structure_count: 1 })}
        onReload={noopAsync}
        onDelete={noopAsync}
      />,
    );
    expect(screen.getByText(/1 substance(?!s)/)).toBeInTheDocument();
  });
});
