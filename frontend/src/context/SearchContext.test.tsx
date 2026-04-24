/**
 * SearchContext — Bug C fix verification.
 *
 * Two consumers of useSearch() must see the SAME state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { SearchProvider, useSearch } from "@/context/SearchContext";

vi.mock("@/lib/apiClient", () => ({
  postSearch: vi.fn(() =>
    Promise.resolve({ results: [], total: 0, page: 1, size: 24, warnings: [] }),
  ),
  postSearchValidate: vi.fn(() =>
    Promise.resolve({ valid: true, language: "smiles", atom_count: 6, error: null }),
  ),
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

function WriteConsumer({ newQuery }: { newQuery: string }) {
  const { setQuery, query } = useSearch();
  return (
    <>
      <button data-testid="write" onClick={() => setQuery(newQuery)}>
        current: {query}
      </button>
    </>
  );
}

function ReadConsumer() {
  const { query } = useSearch();
  return <div data-testid="read">read: {query}</div>;
}

describe("SearchContext", () => {
  it("two consumers share one state — setQuery in A is visible in B", () => {
    render(
      <SearchProvider>
        <WriteConsumer newQuery="hexane" />
        <ReadConsumer />
      </SearchProvider>,
    );
    expect(screen.getByTestId("read").textContent).toBe("read: ");
    act(() => {
      screen.getByTestId("write").click();
    });
    expect(screen.getByTestId("read").textContent).toBe("read: hexane");
  });

  it("throws when useSearch is called outside SearchProvider", () => {
    // Suppress React's error logging for this test.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ReadConsumer />)).toThrow(/SearchProvider/);
    spy.mockRestore();
  });
});
