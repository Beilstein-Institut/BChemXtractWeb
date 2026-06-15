/**
 * Tests for useReactions hook.
 *
 * Mirrors useExtract.test.ts (state machine) + adds coverage for
 * AbortController cancellation on re-invocation and unmount.
 *
 * postReactions is mocked via vi.mock so hook state transitions can be
 * driven deterministically without touching the real fetch layer.
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { vi, beforeEach } from "vitest";
import type { ReactionExtractionResponse } from "../types/chemistry";

// Mock the apiClient module — control postReactions' behavior per test.
vi.mock("../lib/apiClient", () => ({
  postReactions: vi.fn(),
}));

import { useReactions } from "./useReactions";
import { postReactions } from "../lib/apiClient";

const mockPostReactions = postReactions as ReturnType<typeof vi.fn>;

const buildResponse = (
  overrides: Partial<ReactionExtractionResponse> = {},
): ReactionExtractionResponse => ({
  reactions: [],
  format: "cdx",
  filename: "test.cdx",
  file_size: 100,
  reaction_count: 0,
  extraction_time_ms: 12.5,
  warnings: [],
  ...overrides,
});

const mkFile = () => new File(["data"], "test.cdx", { type: "chemical/x-cdx" });

describe("useReactions hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initial state is idle (state='idle', result=null, errorMessage=null)", () => {
    const { result } = renderHook(() => useReactions());
    expect(result.current.state).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it("transitions idle → loading → success on successful POST /api/reactions", async () => {
    mockPostReactions.mockResolvedValueOnce(buildResponse({ reaction_count: 2 }));
    const { result } = renderHook(() => useReactions());

    await act(async () => {
      await result.current.extract(mkFile());
    });
    await waitFor(() => expect(result.current.state).toBe("success"));

    expect(result.current.result?.reaction_count).toBe(2);
    expect(result.current.errorMessage).toBeNull();
  });

  it("transitions idle → loading → error on failed POST /api/reactions", async () => {
    mockPostReactions.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useReactions());

    await act(async () => {
      await result.current.extract(mkFile());
    });
    await waitFor(() => expect(result.current.state).toBe("error"));

    expect(result.current.errorMessage).toBe("boom");
    expect(result.current.result).toBeNull();
  });

  it("treats 200 with warnings as success — timeout contract", async () => {
    mockPostReactions.mockResolvedValueOnce(
      buildResponse({
        reactions: [],
        reaction_count: 0,
        warnings: ["Reaction extraction exceeded 30s timeout and was aborted."],
      }),
    );
    const { result } = renderHook(() => useReactions());

    await act(async () => {
      await result.current.extract(mkFile());
    });
    await waitFor(() => expect(result.current.state).toBe("success"));

    expect(result.current.result?.warnings.length).toBeGreaterThan(0);
    expect(result.current.errorMessage).toBeNull();
  });

  it("reset() returns state to idle and clears result/errorMessage", async () => {
    mockPostReactions.mockResolvedValueOnce(buildResponse());
    const { result } = renderHook(() => useReactions());

    await act(async () => {
      await result.current.extract(mkFile());
    });
    await waitFor(() => expect(result.current.state).toBe("success"));

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it("cancels prior in-flight request when extract() is called again", async () => {
    const capturedSignals: (AbortSignal | undefined)[] = [];

    // First call: hangs until its signal is aborted, then rejects with AbortError.
    mockPostReactions.mockImplementationOnce(async (_file: File, signal?: AbortSignal) => {
      capturedSignals.push(signal);
      await new Promise<never>((_, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
      return buildResponse(); // never reached
    });
    // Second call: resolves successfully.
    mockPostReactions.mockImplementationOnce(async (_file: File, signal?: AbortSignal) => {
      capturedSignals.push(signal);
      return buildResponse({ reaction_count: 5 });
    });

    const { result } = renderHook(() => useReactions());

    // Fire first extract (will hang until aborted).
    act(() => {
      void result.current.extract(mkFile());
    });

    // Fire second extract — should abort the first controller.
    await act(async () => {
      await result.current.extract(mkFile());
    });
    await waitFor(() => expect(result.current.state).toBe("success"));

    expect(capturedSignals[0]?.aborted).toBe(true);
    expect(result.current.result?.reaction_count).toBe(5);
  });

  it("aborts in-flight request on unmount (no state leaks)", async () => {
    let capturedSignal: AbortSignal | undefined;

    mockPostReactions.mockImplementation(async (_file: File, signal?: AbortSignal) => {
      capturedSignal = signal;
      await new Promise<never>((_, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
      return buildResponse();
    });

    const { result, unmount } = renderHook(() => useReactions());

    act(() => {
      void result.current.extract(mkFile());
    });

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });
});
