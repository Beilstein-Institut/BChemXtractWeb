/**
 * HistoryList tests.
 *
 * Covers:
 *   - Empty state via shared <EmptyState>.
 *   - Toolbar renders with search + export button.
 *   - Sticky column header emitted alongside rows.
 *   - Zebra striping: odd rows (index 1, 3, ...) get `bg-surface-elevated`.
 *   - Row click reloads the extraction and forwards the response.
 *   - Search filters by filename and format (debounced + case-insensitive).
 *   - CSV export button invokes a blob download via URL.createObjectURL.
 *   - "Show all N" link only when total > 10.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

import { HistoryList } from "./HistoryList";
import type { HistoryListItem } from "@/types/history";

const mockReload = {
  substances: [],
  info: { no_fragments: 0, no_inchis: 0, no_substances: 0 },
  format: "cdx" as const,
  filename: "test.cdx",
  file_size: 0,
  structure_count: 0,
  extraction_time_ms: 0,
  warnings: [],
};

function mkEntry(overrides: Partial<HistoryListItem> = {}): HistoryListItem {
  return {
    id: 1,
    filename: "sample.cdx",
    file_size: 1024,
    format: "cdx",
    structure_count: 3,
    extraction_time_ms: 120.5,
    warnings: [],
    created_at: new Date().toISOString(),
    reaction_count: 0,
    ...overrides,
  };
}

const noopToggle = () => {};
const noopReloadSuccess = () => {};
const noopDelete = async () => {};
const alwaysReload = async () => mockReload;

describe("HistoryList", () => {
  it("renders shared EmptyState when there are no entries", () => {
    render(
      <HistoryList
        entries={[]}
        total={0}
        loading={false}
        showAll={false}
        onToggleShowAll={noopToggle}
        onReload={alwaysReload}
        onDelete={noopDelete}
        onReloadSuccess={noopReloadSuccess}
      />,
    );
    expect(screen.getByText("No extractions yet")).toBeInTheDocument();
    expect(screen.getByText("Upload a CDX or CDXML file to get started.")).toBeInTheDocument();
  });

  it("renders toolbar with search and CSV export affordances", () => {
    render(
      <HistoryList
        entries={[mkEntry()]}
        total={1}
        loading={false}
        showAll={false}
        onToggleShowAll={noopToggle}
        onReload={alwaysReload}
        onDelete={noopDelete}
        onReloadSuccess={noopReloadSuccess}
      />,
    );
    expect(screen.getByText("Recent extractions")).toBeInTheDocument();
    expect(screen.getByLabelText("Search history")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export history to csv/i })).toBeInTheDocument();
  });

  it("renders sticky column header + zebra row layout", () => {
    const entries = [
      mkEntry({ id: 1, filename: "a.cdx" }),
      mkEntry({ id: 2, filename: "b.cdx" }),
      mkEntry({ id: 3, filename: "c.cdx" }),
    ];
    const { container } = render(
      <HistoryList
        entries={entries}
        total={entries.length}
        loading={false}
        showAll={false}
        onToggleShowAll={noopToggle}
        onReload={alwaysReload}
        onDelete={noopDelete}
        onReloadSuccess={noopReloadSuccess}
      />,
    );
    expect(container.querySelector('[data-slot="history-header"]')).not.toBeNull();
    const rows = container.querySelectorAll('[data-slot="history-row"]');
    expect(rows.length).toBe(3);
    // index 0 → even (no elevated bg), index 1 → odd (elevated), index 2 → even.
    expect(rows[0].getAttribute("data-even")).toBe("true");
    expect(rows[1].getAttribute("data-even")).toBe(null);
    expect(rows[1].className).toContain("bg-surface-elevated");
    expect(rows[2].getAttribute("data-even")).toBe("true");
  });

  it("clicking a row calls onReload + onReloadSuccess", async () => {
    const onReload = vi.fn(async () => mockReload);
    const onReloadSuccess = vi.fn();
    render(
      <HistoryList
        entries={[mkEntry({ id: 7, filename: "clickme.cdx" })]}
        total={1}
        loading={false}
        showAll={false}
        onToggleShowAll={noopToggle}
        onReload={onReload}
        onDelete={noopDelete}
        onReloadSuccess={onReloadSuccess}
      />,
    );
    const row = screen.getByRole("button", { name: /open extraction clickme/i });
    await act(async () => {
      fireEvent.click(row);
    });
    expect(onReload).toHaveBeenCalledWith(7);
    await waitFor(() => {
      expect(onReloadSuccess).toHaveBeenCalledWith(mockReload);
    });
  });

  it("keyboard activation on a row reloads the extraction", async () => {
    const onReload = vi.fn(async () => mockReload);
    const onReloadSuccess = vi.fn();
    render(
      <HistoryList
        entries={[mkEntry({ id: 9, filename: "kbd.cdx" })]}
        total={1}
        loading={false}
        showAll={false}
        onToggleShowAll={noopToggle}
        onReload={onReload}
        onDelete={noopDelete}
        onReloadSuccess={onReloadSuccess}
      />,
    );
    const row = screen.getByRole("button", { name: /open extraction kbd/i });
    // The row is now a native <button>, which the user agent activates on
    // Enter / Space by firing a synthetic click — no custom keydown handler
    // to assert against. Dispatching the click event directly is the DOM-
    // level equivalent of pressing Enter on a focused button.
    await act(async () => {
      fireEvent.click(row);
    });
    expect(onReload).toHaveBeenCalledWith(9);
  });

  it("filters entries by case-insensitive filename match", async () => {
    const entries = [
      mkEntry({ id: 1, filename: "Alpha.cdx" }),
      mkEntry({ id: 2, filename: "Beta.cdxml", format: "cdxml" }),
    ];
    render(
      <HistoryList
        entries={entries}
        total={entries.length}
        loading={false}
        showAll={false}
        onToggleShowAll={noopToggle}
        onReload={alwaysReload}
        onDelete={noopDelete}
        onReloadSuccess={noopReloadSuccess}
      />,
    );
    expect(screen.getByText("Alpha.cdx")).toBeInTheDocument();
    expect(screen.getByText("Beta.cdxml")).toBeInTheDocument();

    const search = screen.getByLabelText("Search history");
    fireEvent.change(search, { target: { value: "beta" } });

    // Debounce window in the hook is ≤150ms; advance timers if the impl
    // uses fake timers. Here we just wait for the UI to settle.
    await waitFor(() => {
      expect(screen.queryByText("Alpha.cdx")).toBeNull();
    });
    expect(screen.getByText("Beta.cdxml")).toBeInTheDocument();
  });

  it("filters by format", async () => {
    const entries = [
      mkEntry({ id: 1, filename: "a.cdx", format: "cdx" }),
      mkEntry({ id: 2, filename: "b.cdxml", format: "cdxml" }),
    ];
    render(
      <HistoryList
        entries={entries}
        total={entries.length}
        loading={false}
        showAll={false}
        onToggleShowAll={noopToggle}
        onReload={alwaysReload}
        onDelete={noopDelete}
        onReloadSuccess={noopReloadSuccess}
      />,
    );
    const search = screen.getByLabelText("Search history");
    fireEvent.change(search, { target: { value: "cdxml" } });
    await waitFor(() => {
      expect(screen.queryByText("a.cdx")).toBeNull();
    });
    expect(screen.getByText("b.cdxml")).toBeInTheDocument();
  });

  it("clicking Export CSV triggers URL.createObjectURL + anchor click", async () => {
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-csv");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const anchorClick = vi.fn();
    const originalCreate = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        const el = originalCreate(tag);
        if (tag === "a") el.click = anchorClick;
        return el;
      });

    render(
      <HistoryList
        entries={[mkEntry({ id: 1, filename: "export.cdx" })]}
        total={1}
        loading={false}
        showAll={false}
        onToggleShowAll={noopToggle}
        onReload={alwaysReload}
        onDelete={noopDelete}
        onReloadSuccess={noopReloadSuccess}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /export history to csv/i }));
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith("blob:mock-csv");

    createSpy.mockRestore();
    revokeSpy.mockRestore();
    createElementSpy.mockRestore();
  });

  it("disables Export CSV when the filtered slice is empty", async () => {
    render(
      <HistoryList
        entries={[mkEntry({ id: 1, filename: "only.cdx" })]}
        total={1}
        loading={false}
        showAll={false}
        onToggleShowAll={noopToggle}
        onReload={alwaysReload}
        onDelete={noopDelete}
        onReloadSuccess={noopReloadSuccess}
      />,
    );
    const search = screen.getByLabelText("Search history");
    fireEvent.change(search, { target: { value: "__no-match__" } });
    await waitFor(() => {
      const btn = screen.getByRole("button", {
        name: /export history to csv/i,
      });
      expect(btn).toBeDisabled();
    });
  });

  it("shows 'Show all N' link when total > 10", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      mkEntry({ id: i + 1, filename: `f${i}.cdx` }),
    );
    render(
      <HistoryList
        entries={many}
        total={25}
        loading={false}
        showAll={false}
        onToggleShowAll={noopToggle}
        onReload={alwaysReload}
        onDelete={noopDelete}
        onReloadSuccess={noopReloadSuccess}
      />,
    );
    expect(screen.getByText(/Show all 25 extractions/)).toBeInTheDocument();
  });
});
