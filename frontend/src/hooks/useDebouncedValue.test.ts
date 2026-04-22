/**
 * useDebouncedValue — hook tests.
 *
 * Verifies trailing-edge semantics (update only after `delay` ms of
 * inactivity), rapid-change collapsing, zero-delay pass-through, and
 * cleanup on unmount.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { useDebouncedValue } from "./useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value synchronously on first render", () => {
    const { result } = renderHook(() => useDebouncedValue("hello", 250));
    expect(result.current).toBe("hello");
  });

  it("delays propagation of value changes by `delay` ms", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 250),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("b");
  });

  it("collapses rapid changes into the trailing value", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 200),
      { initialProps: { value: "first" } },
    );

    rerender({ value: "second" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: "third" });
    act(() => {
      vi.advanceTimersByTime(199);
    });
    // Still at the initial value — each rerender reset the timer.
    expect(result.current).toBe("first");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("third");
  });

  it("flushes on the next macrotask when delay <= 0", () => {
    // `delay <= 0` clamps to a setTimeout(…, 0) so React's effect cycle
    // stays clean (no synchronous setState inside useEffect). The value
    // still propagates within a single tick under fake timers.
    const { result, rerender } = renderHook(
      ({ value }: { value: number }) => useDebouncedValue(value, 0),
      { initialProps: { value: 1 } },
    );
    rerender({ value: 2 });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe(2);
  });

  it("cancels pending updates on unmount", () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 250),
      { initialProps: { value: "x" } },
    );
    rerender({ value: "y" });
    unmount();
    // Advancing past the delay after unmount must not throw or flush.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Result reference captured before unmount still sees the last committed value.
    expect(result.current).toBe("x");
  });
});
