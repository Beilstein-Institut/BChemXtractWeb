/**
 * Tests for useCdxRender hook.
 *
 * Mirrors usePubChemEnrichment.test.tsx's `vi.spyOn(api, ...)` pattern —
 * spying on the named export directly (rather than a `vi.mock` factory)
 * keeps the real `ApiError` class intact so the error-path test can
 * construct a genuine instance the hook's `instanceof ApiError` check
 * recognizes.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as api from "@/lib/apiClient";
import { useCdxRender } from "./useCdxRender";

describe("useCdxRender", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("moves idle -> loading -> success and exposes svg", async () => {
    vi.spyOn(api, "getRenderedCdx").mockResolvedValue("<svg>ok</svg>");
    const { result } = renderHook(() => useCdxRender());
    expect(result.current.state).toBe("idle");

    act(() => result.current.render(1));

    await waitFor(() => expect(result.current.state).toBe("success"));
    expect(result.current.svg).toContain("<svg");
    expect(result.current.errorCode).toBeNull();
  });

  it("captures error code on failure", async () => {
    const err = new api.ApiError("Could not render the original file: no file", {
      code: "FILE_NOT_STORED",
      status: 409,
    });
    vi.spyOn(api, "getRenderedCdx").mockRejectedValue(err);
    const { result } = renderHook(() => useCdxRender());

    act(() => result.current.render(2));

    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.errorCode).toBe("FILE_NOT_STORED");
    expect(result.current.svg).toBeNull();
  });

  it("reset() returns to idle and clears svg/errorCode", async () => {
    vi.spyOn(api, "getRenderedCdx").mockResolvedValue("<svg>ok</svg>");
    const { result } = renderHook(() => useCdxRender());

    act(() => result.current.render(1));
    await waitFor(() => expect(result.current.state).toBe("success"));

    act(() => result.current.reset());

    expect(result.current.state).toBe("idle");
    expect(result.current.svg).toBeNull();
    expect(result.current.errorCode).toBeNull();
  });

  it("ignores a stale in-flight response when render() is called again first", async () => {
    let resolveFirst: (v: string) => void;
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const spy = vi.spyOn(api, "getRenderedCdx");
    spy.mockReturnValueOnce(first);
    spy.mockResolvedValueOnce("<svg>second</svg>");

    const { result } = renderHook(() => useCdxRender());

    act(() => result.current.render(1));
    act(() => result.current.render(2));

    await waitFor(() => expect(result.current.state).toBe("success"));
    expect(result.current.svg).toBe("<svg>second</svg>");

    // The stale first response resolving afterward must not clobber state.
    await act(async () => {
      resolveFirst("<svg>stale</svg>");
      await Promise.resolve();
    });
    expect(result.current.svg).toBe("<svg>second</svg>");
  });

  it("reset() invalidates an in-flight render() request, so a stale response doesn't land", async () => {
    let resolve!: (v: string) => void;
    vi.spyOn(api, "getRenderedCdx").mockReturnValue(
      new Promise<string>((r) => {
        resolve = r;
      })
    );

    const { result } = renderHook(() => useCdxRender());

    act(() => result.current.render(1));
    expect(result.current.state).toBe("loading");

    act(() => result.current.reset());
    expect(result.current.state).toBe("idle");
    expect(result.current.svg).toBeNull();

    // The in-flight promise resolves after reset — it must not land.
    await act(async () => {
      resolve("<svg/>");
      await Promise.resolve();
    });

    expect(result.current.state).toBe("idle");
    expect(result.current.svg).toBeNull();
  });
});
