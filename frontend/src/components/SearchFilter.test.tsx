/**
 * SearchFilter — composite tests (Phase 3 Task 11).
 *
 * Covers:
 *   - renders the search input + 3 filter chips
 *   - typing in the search input debounces onChange (250 ms)
 *   - toggling a chip flips `data-active` and emits onChange immediately
 *   - "Clear" button appears when any filter is active and resets state
 *   - data-slot contract (`browse-search-filter`, `filter-chip`)
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { SearchFilter } from "./SearchFilter";
import {
  EMPTY_FILTERS,
  type BrowseFilters,
} from "./browse/browseFilters";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderSearchFilter(initial: Partial<BrowseFilters> = {}) {
  const onChange = vi.fn();
  const value: BrowseFilters = { ...EMPTY_FILTERS, ...initial };
  const utils = render(<SearchFilter value={value} onChange={onChange} />);
  return { onChange, value, ...utils };
}

describe("SearchFilter", () => {
  it("exposes the browse-search-filter data-slot on root", () => {
    const { container } = renderSearchFilter();
    const root = container.querySelector('[data-slot="browse-search-filter"]');
    expect(root).not.toBeNull();
  });

  it("renders search input + 3 filter chips with aria-pressed", () => {
    renderSearchFilter();
    expect(
      screen.getByRole("searchbox", {
        name: /search structures in this extraction/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /has iupac name/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /smiles available/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /inchi available/i })).toBeInTheDocument();
  });

  it("debounces the free-text query by 250 ms before emitting", () => {
    const { onChange } = renderSearchFilter();
    const input = screen.getByRole("searchbox");
    act(() => {
      fireEvent.change(input, { target: { value: "C6H6" } });
    });
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({ ...EMPTY_FILTERS, q: "C6H6" });
  });

  it("collapses rapid typing into a single trailing onChange", () => {
    const { onChange } = renderSearchFilter();
    const input = screen.getByRole("searchbox");
    act(() => {
      fireEvent.change(input, { target: { value: "b" } });
      vi.advanceTimersByTime(100);
      fireEvent.change(input, { target: { value: "be" } });
      vi.advanceTimersByTime(100);
      fireEvent.change(input, { target: { value: "ben" } });
      vi.advanceTimersByTime(250);
    });
    // Only the final "ben" value propagates.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].q).toBe("ben");
  });

  it("toggling a chip fires onChange immediately and flips data-active", () => {
    const { onChange, rerender } = renderSearchFilter();
    const chip = screen.getByRole("button", { name: /has iupac name/i });
    expect(chip.getAttribute("data-active")).toBeNull();

    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, hasName: true });

    // Simulate the parent flushing that change back down.
    rerender(
      <SearchFilter
        value={{ ...EMPTY_FILTERS, hasName: true }}
        onChange={onChange}
      />,
    );
    const toggled = screen.getByRole("button", { name: /has iupac name/i });
    expect(toggled.getAttribute("data-active")).toBe("true");
    expect(toggled.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows Clear button only when filters are active", () => {
    const { rerender, onChange } = renderSearchFilter();
    expect(screen.queryByRole("button", { name: /clear all filters/i })).toBeNull();

    rerender(
      <SearchFilter
        value={{ ...EMPTY_FILTERS, hasSmiles: true }}
        onChange={onChange}
      />,
    );
    const clearBtn = screen.getByRole("button", { name: /clear all filters/i });
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });

  it("every chip carries data-slot='filter-chip'", () => {
    const { container } = renderSearchFilter();
    const chips = container.querySelectorAll('[data-slot="filter-chip"]');
    expect(chips.length).toBe(3);
  });
});
