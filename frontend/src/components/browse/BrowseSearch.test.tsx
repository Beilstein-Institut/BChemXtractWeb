import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SearchProvider } from "@/context/SearchContext";
import { postSearch } from "@/lib/apiClient";
import { BrowseSearch } from "./BrowseSearch";

vi.mock("@/lib/apiClient", () => ({
  postSearch: vi.fn(() =>
    Promise.resolve({ results: [], total: 0, page: 1, size: 24, warnings: [] }),
  ),
  postSearchValidate: vi.fn(),
}));

function renderSearch(extractionId: number | null) {
  return render(
    <SearchProvider>
      <BrowseSearch extractionId={extractionId} />
    </SearchProvider>,
  );
}

const lastScope = () => vi.mocked(postSearch).mock.calls.at(-1)?.[0].scope;

describe("BrowseSearch", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/browse");
    vi.mocked(postSearch).mockClear();
  });

  it("searches the browsed extraction by default, and all extractions when toggled", async () => {
    renderSearch(7);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "C6H6" } });
    await waitFor(() => expect(lastScope()).toBe("extraction:7"));

    fireEvent.click(screen.getByRole("button", { name: "All extractions" }));
    await waitFor(() => expect(lastScope()).toBe("global"));
  });

  it("searches globally, with no scope toggle, when no extraction is loaded", async () => {
    renderSearch(null);
    expect(screen.queryByRole("button", { name: "This extraction" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "C6H6" } });
    await waitFor(() => expect(lastScope()).toBe("global"));
  });
  it("moves an active search to the new extraction when the browsed one changes", async () => {
    const { rerender } = render(
      <SearchProvider>
        <BrowseSearch extractionId={12} />
      </SearchProvider>,
    );
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "CCO" } });
    await waitFor(() => expect(lastScope()).toBe("extraction:12"));

    rerender(
      <SearchProvider>
        <BrowseSearch extractionId={20} />
      </SearchProvider>,
    );
    await waitFor(() => expect(lastScope()).toBe("extraction:20"));
  });
});
