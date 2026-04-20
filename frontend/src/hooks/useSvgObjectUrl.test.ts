import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSvgObjectUrl } from "./useSvgObjectUrl";

describe("useSvgObjectUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when svg is null or empty", () => {
    const { result, rerender } = renderHook(
      ({ svg }: { svg: string | null }) => useSvgObjectUrl(svg),
      { initialProps: { svg: null } },
    );
    expect(result.current).toBeNull();

    rerender({ svg: "" });
    expect(result.current).toBeNull();
  });

  it("returns a blob: URL for a non-empty svg", () => {
    const { result } = renderHook(() =>
      useSvgObjectUrl("<svg xmlns='http://www.w3.org/2000/svg'/>"),
    );
    expect(result.current).toMatch(/^blob:/);
  });

  it("revokes the previous URL when svg changes", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const { result, rerender } = renderHook(
      ({ svg }: { svg: string }) => useSvgObjectUrl(svg),
      { initialProps: { svg: "<svg>a</svg>" } },
    );
    const firstUrl = result.current;
    expect(firstUrl).toMatch(/^blob:/);

    rerender({ svg: "<svg>b</svg>" });
    expect(result.current).toMatch(/^blob:/);
    expect(result.current).not.toBe(firstUrl);
    expect(revoke).toHaveBeenCalledWith(firstUrl);
  });

  it("revokes the URL on unmount", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const { result, unmount } = renderHook(() =>
      useSvgObjectUrl("<svg>x</svg>"),
    );
    const url = result.current;
    expect(url).toMatch(/^blob:/);

    act(() => unmount());
    expect(revoke).toHaveBeenCalledWith(url);
  });
});
