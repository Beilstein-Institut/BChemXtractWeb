/**
 * useKeyboardShortcut — hook tests.
 *
 * Covers modifier matching, case-insensitive key compare, the Ctrl===Meta
 * bridge, ref-based handler updates, unmount cleanup, and the `enabled`
 * flag.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useKeyboardShortcut } from "./useKeyboardShortcut";

/** Dispatch a synthetic keydown on window. */
function press(
  key: string,
  mods: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {},
): void {
  const event = new KeyboardEvent("keydown", {
    key,
    metaKey: mods.meta ?? false,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    window.dispatchEvent(event);
  });
}

describe("useKeyboardShortcut", () => {
  it("fires the handler on a matching key + meta combo", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut({ key: "k", meta: true }, handler));
    press("k", { meta: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("treats Ctrl as equivalent to Meta for the meta flag", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut({ key: "k", meta: true }, handler));
    press("k", { ctrl: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire when the meta modifier is missing but required", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut({ key: "k", meta: true }, handler));
    press("k");
    expect(handler).not.toHaveBeenCalled();
  });

  it("does NOT fire when meta is pressed but the descriptor doesn't ask for it", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut({ key: "Escape" }, handler));
    press("Escape", { meta: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("matches letter keys case-insensitively (Shift+K press against {key: 'k'} still requires shift flag)", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut({ key: "K" }, handler));
    // Plain "k" still matches because the descriptor is case-insensitive.
    press("k");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("respects the shift modifier as an exact match", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut({ key: "/", shift: true }, handler));
    press("/");
    expect(handler).not.toHaveBeenCalled();
    press("/", { shift: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("calls the latest handler reference without re-binding", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ h }: { h: (e: KeyboardEvent) => void }) =>
        useKeyboardShortcut({ key: "k", meta: true }, h),
      { initialProps: { h: first } },
    );
    press("k", { meta: true });
    expect(first).toHaveBeenCalledTimes(1);

    rerender({ h: second });
    press("k", { meta: true });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("removes the listener on unmount", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useKeyboardShortcut({ key: "k", meta: true }, handler));
    unmount();
    press("k", { meta: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not bind when enabled=false, binds when it flips to true", () => {
    const handler = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useKeyboardShortcut({ key: "k", meta: true }, handler, { enabled }),
      { initialProps: { enabled: false } },
    );
    press("k", { meta: true });
    expect(handler).not.toHaveBeenCalled();

    rerender({ enabled: true });
    press("k", { meta: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
