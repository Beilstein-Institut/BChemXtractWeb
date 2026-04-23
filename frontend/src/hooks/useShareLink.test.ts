/**
 * useShareLink — hook tests.
 *
 * Covers URL shape, clipboard write, the transient "shared" flag lifecycle,
 * no-op on empty key, graceful handling of clipboard failure, and cleanup
 * on unmount so the 2 s timer never updates unmounted state.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildShareUrl, useShareLink } from "./useShareLink";

describe("buildShareUrl", () => {
  it("encodes the InChI key and defaults to /browse", () => {
    expect(buildShareUrl("https://app.test", "UHOVQNZJYSORNB-UHFFFAOYSA-N")).toBe(
      "https://app.test/browse#s=UHOVQNZJYSORNB-UHFFFAOYSA-N",
    );
  });

  it("URL-encodes reserved characters in the key", () => {
    expect(buildShareUrl("https://app.test", "a b/c")).toContain("#s=a%20b%2Fc");
  });
});

describe("useShareLink", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      writable: true,
      configurable: true,
      value: { writeText },
    });
    // Pin window.location.origin so the assertion is deterministic.
    Object.defineProperty(window, "location", {
      writable: true,
      configurable: true,
      value: { ...window.location, origin: "https://app.test" },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes a browse URL with the encoded InChI key to the clipboard", async () => {
    const { result } = renderHook(() => useShareLink());
    await act(async () => {
      await result.current.share("UHOVQNZJYSORNB-UHFFFAOYSA-N");
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe(
      "https://app.test/browse#s=UHOVQNZJYSORNB-UHFFFAOYSA-N",
    );
    expect(result.current.shared).toBe(true);
  });

  it("resets the shared flag after 2 seconds", async () => {
    const { result } = renderHook(() => useShareLink());
    await act(async () => {
      await result.current.share("KEYABC");
    });
    expect(result.current.shared).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(result.current.shared).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.shared).toBe(false);
  });

  it("is a no-op for null / empty keys", async () => {
    const { result } = renderHook(() => useShareLink());
    await act(async () => {
      await result.current.share(null);
      await result.current.share(undefined);
      await result.current.share("");
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.shared).toBe(false);
  });

  it("leaves shared=false when clipboard.writeText rejects", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const { result } = renderHook(() => useShareLink());
    await act(async () => {
      await result.current.share("KEYXYZ");
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(result.current.shared).toBe(false);
  });

  it("cleans up the pending timer on unmount", async () => {
    const clearSpy = vi.spyOn(window, "clearTimeout");
    const { result, unmount } = renderHook(() => useShareLink());
    await act(async () => {
      await result.current.share("KEYUNMOUNT");
    });
    unmount();
    // Unmount cleanup should have called clearTimeout for the pending 2s timer.
    expect(clearSpy).toHaveBeenCalled();
    // Advancing the timer after unmount must not throw or update state.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
  });
});
