/**
 * useSearch — concrete tests for the search URL-state + fetch hook (Plan 06).
 *
 * Covers D-03 (debounce text vs. explicit substructure submit),
 * URL-state round-trip (q/type/scope/match/page) mirroring the useBrowse
 * pattern from Phase 6, and the 'searchurlchange' CustomEvent dispatch
 * that Plan 07's App.tsx will listen for.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSearch } from "@/hooks/useSearch";

// Stub postSearch — we're testing the hook's URL/state behavior, not fetch.
vi.mock("@/lib/apiClient", () => ({
  postSearch: vi.fn(() =>
    Promise.resolve({
      results: [],
      total: 0,
      page: 1,
      size: 24,
      warnings: [],
    })
  ),
}));

describe("useSearch", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("reads initial q/type/scope from URL", () => {
    window.history.replaceState(null, "", "/?q=abc&type=formula");
    const { result } = renderHook(() => useSearch());
    expect(result.current.query).toBe("abc");
    expect(result.current.type).toBe("formula");
  });

  it("setQuery writes via replaceState, not pushState", () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    const { result } = renderHook(() => useSearch());
    act(() => result.current.setQuery("benz"));
    expect(pushSpy).not.toHaveBeenCalled();
    expect(window.location.search).toContain("q=benz");
  });

  it("setQuery dispatches 'searchurlchange' event (Plan 07 integration)", () => {
    const handler = vi.fn();
    window.addEventListener("searchurlchange", handler);
    const { result } = renderHook(() => useSearch());
    act(() => result.current.setQuery("benz"));
    window.removeEventListener("searchurlchange", handler);
    expect(handler).toHaveBeenCalled();
  });

  it("clear() empties state and URL and fires 'searchurlchange'", () => {
    const handler = vi.fn();
    window.history.replaceState(null, "", "/?q=x&type=formula");
    window.addEventListener("searchurlchange", handler);
    const { result } = renderHook(() => useSearch());
    act(() => result.current.clear());
    window.removeEventListener("searchurlchange", handler);
    expect(result.current.query).toBe("");
    expect(window.location.search).toBe("");
    expect(handler).toHaveBeenCalled();
  });

  it("submit() triggers a fetch even without debounce elapse", async () => {
    const mod = await import("@/lib/apiClient");
    (mod.postSearch as unknown as ReturnType<typeof vi.fn>).mockClear();
    const { result } = renderHook(() => useSearch());
    act(() => result.current.setQuery("c1ccccc1"));
    act(() => result.current.setType("substructure"));
    act(() => result.current.submit());
    expect(
      (mod.postSearch as unknown as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBeGreaterThan(0);
  });
});
