/**
 * useSearchImpl — implementation hook wrapped by SearchContext.
 *
 * Covers:
 *  - URL-state round trip (q/type/scope/match/page/stereo)
 *  - Debounced fetch for non-substructure types (unchanged)
 *  - Validation-gated fetch for substructure (new)
 *  - Stereo toggle → URL + new fetch
 *  - Invalid substructure query → no fetch
 *  - Clear() resets everything including stereo
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSearchImpl } from "@/hooks/useSearchImpl";

vi.mock("@/lib/apiClient", () => ({
  postSearch: vi.fn(() =>
    Promise.resolve({ results: [], total: 0, page: 1, size: 24, warnings: [] }),
  ),
  postSearchValidate: vi.fn(() =>
    Promise.resolve({ valid: true, language: "smiles", atom_count: 6, error: null }),
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("useSearchImpl — URL round trip", () => {
  it("reads q/type/scope/stereo from URL on mount", () => {
    window.history.replaceState(null, "", "/?q=abc&type=formula&stereo=1");
    const { result } = renderHook(() => useSearchImpl());
    expect(result.current.query).toBe("abc");
    expect(result.current.type).toBe("formula");
    expect(result.current.stereo).toBe(true);
  });

  it("setQuery writes via replaceState", () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    const { result } = renderHook(() => useSearchImpl());
    act(() => result.current.setQuery("benz"));
    expect(pushSpy).not.toHaveBeenCalled();
    expect(window.location.search).toContain("q=benz");
  });

  it("setStereo toggles stereo and writes ?stereo=1 to URL", () => {
    const { result } = renderHook(() => useSearchImpl());
    act(() => result.current.setQuery("C[C@H](O)N"));
    act(() => result.current.setType("substructure"));
    act(() => result.current.setStereo(true));
    expect(result.current.stereo).toBe(true);
    expect(window.location.search).toContain("stereo=1");
  });
});

describe("useSearchImpl — substructure validation gate", () => {
  it("valid query → validate then fetch", async () => {
    const { postSearch, postSearchValidate } = await import("@/lib/apiClient");
    const { result } = renderHook(() => useSearchImpl());

    act(() => {
      result.current.setType("substructure");
      result.current.setQuery("c1ccccc1");
    });

    await waitFor(() => {
      expect(postSearchValidate).toHaveBeenCalledWith(
        expect.objectContaining({ query: "c1ccccc1" }),
      );
    });
    await waitFor(() => {
      expect(postSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "c1ccccc1",
          type: "substructure",
          stereo: false,
        }),
      );
    });
  });

  it("invalid query → validate only, no fetch", async () => {
    const { postSearch, postSearchValidate } = await import("@/lib/apiClient");
    (postSearchValidate as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      valid: false,
      language: null,
      atom_count: 0,
      error: "Unclosed ring",
    });

    const { result } = renderHook(() => useSearchImpl());
    act(() => {
      result.current.setType("substructure");
      result.current.setQuery("c1ccc(((");
    });

    await waitFor(() => {
      expect(postSearchValidate).toHaveBeenCalled();
    });
    // Wait long enough for the fetch debounce to have expired if the gate failed.
    await new Promise((r) => setTimeout(r, 500));
    expect(postSearch).not.toHaveBeenCalled();
  });

  it("stereo toggle re-fetches with stereo:true", async () => {
    const { postSearch } = await import("@/lib/apiClient");
    const { result } = renderHook(() => useSearchImpl());

    act(() => {
      result.current.setType("substructure");
      result.current.setQuery("c1ccccc1");
    });
    await waitFor(() => expect(postSearch).toHaveBeenCalled());
    (postSearch as unknown as ReturnType<typeof vi.fn>).mockClear();

    act(() => result.current.setStereo(true));
    await waitFor(() => {
      expect(postSearch).toHaveBeenCalledWith(
        expect.objectContaining({ stereo: true }),
      );
    });
  });
});

describe("useSearchImpl — non-substructure unchanged", () => {
  it("formula query does NOT hit validate endpoint", async () => {
    const { postSearch, postSearchValidate } = await import("@/lib/apiClient");
    const { result } = renderHook(() => useSearchImpl());

    act(() => {
      result.current.setType("formula");
      result.current.setQuery("C6H6");
    });

    await waitFor(() => expect(postSearch).toHaveBeenCalled());
    expect(postSearchValidate).not.toHaveBeenCalled();
  });
});

describe("useSearchImpl — clear", () => {
  it("clear() resets stereo along with other fields", () => {
    const { result } = renderHook(() => useSearchImpl());
    act(() => {
      result.current.setType("substructure");
      result.current.setStereo(true);
      result.current.setQuery("c1ccccc1");
    });
    expect(result.current.stereo).toBe(true);

    act(() => result.current.clear());
    expect(result.current.stereo).toBe(false);
    expect(result.current.query).toBe("");
    expect(window.location.search).toBe("");
  });
});
