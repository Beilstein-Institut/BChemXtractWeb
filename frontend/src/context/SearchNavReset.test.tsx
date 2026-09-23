import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { SearchProvider, useSearch } from "@/context/SearchContext";
import { SearchNavReset } from "@/context/SearchNavReset";
import { navigate } from "@/lib/router";

vi.mock("@/lib/apiClient", () => ({
  postSearch: vi.fn(() =>
    Promise.resolve({ results: [], total: 0, page: 1, size: 24, warnings: [] }),
  ),
  postSearchValidate: vi.fn(),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <SearchProvider>
      <SearchNavReset />
      {children}
    </SearchProvider>
  );
}

const renderSearch = () => renderHook(() => useSearch(), { wrapper: Providers });

describe("SearchNavReset", () => {
  beforeEach(() => window.history.replaceState(null, "", "/browse"));

  it("clears the search on in-app navigation, keeping the new route's params", () => {
    const { result } = renderSearch();
    act(() => result.current.setQuery("C6H6"));
    act(() => navigate("/batch?batch=42"));
    expect(result.current.query).toBe("");
    expect(window.location.pathname + window.location.search).toBe("/batch?batch=42");
  });

  it("restores the search on browser Back", () => {
    const { result } = renderSearch();
    act(() => result.current.setQuery("C6H6")); // URL: /browse?q=C6H6
    act(() => navigate("/history"));
    expect(result.current.query).toBe("");
    // Back: the browser restores /browse?q=C6H6 and fires popstate.
    act(() => {
      window.history.replaceState(null, "", "/browse?q=C6H6");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.query).toBe("C6H6");
  });
});
