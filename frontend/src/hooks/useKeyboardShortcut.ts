/**
 * useKeyboardShortcut — window-level keyboard shortcut hook (Phase 3 Task 14).
 *
 * Registers a single `keydown` listener on `window` and fires the supplied
 * handler when the event matches the descriptor. Typical usage is the ⌘K
 * command palette toggle, but the hook is intentionally generic so other
 * bindings (e.g. `/` to focus search, Escape to close a sheet) can reuse it.
 *
 * Design choices worth calling out:
 * - Ctrl is treated as equivalent to Meta so macOS ⌘K and Windows/Linux
 *   Ctrl+K hit the same codepath without caller branching.
 * - The latest `handler` is stored in a ref so passing a fresh closure on
 *   every render does not re-bind the listener — that keeps the descriptor
 *   effect stable across parent re-renders.
 * - The `enabled` flag lets callers conditionally disable without having to
 *   unmount the hook (e.g. pause the shortcut while an input is focused).
 */
import { useEffect, useRef } from "react";

export interface ShortcutDescriptor {
  /** The non-modifier key (e.g. "k", "/", "Escape"). Matched case-insensitively. */
  key: string;
  /** Require Cmd (macOS) or Ctrl (other). Matched as `metaKey || ctrlKey`. Default false. */
  meta?: boolean;
  /** Require Shift. Default false. */
  shift?: boolean;
  /** Require Alt / Option. Default false. */
  alt?: boolean;
}

export interface UseKeyboardShortcutOptions {
  /** When false, the listener is not bound. Defaults to true. */
  enabled?: boolean;
}

/**
 * Bind a global keyboard shortcut for the component lifetime.
 *
 * The handler fires only when every declared modifier matches *exactly*
 * (a Shift+K press will not trigger a plain `{ key: "k" }` binding).
 * Auto-cleans up on unmount or when `enabled` flips to false.
 */
export function useKeyboardShortcut(
  descriptor: ShortcutDescriptor,
  handler: (event: KeyboardEvent) => void,
  options: UseKeyboardShortcutOptions = {},
): void {
  const { enabled = true } = options;

  // Keep the latest handler in a ref so callers can pass inline arrow
  // functions without forcing the listener to re-bind every render. The
  // ref is synced in a separate effect (not inline during render) to
  // satisfy `react-hooks/ref-during-render` lint rule.
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;

    const wantMeta = descriptor.meta ?? false;
    const wantShift = descriptor.shift ?? false;
    const wantAlt = descriptor.alt ?? false;
    const wantedKey = descriptor.key.toLowerCase();

    function onKeyDown(e: KeyboardEvent): void {
      // Treat Ctrl and Meta as equivalent — macOS Cmd+K and Windows/Linux
      // Ctrl+K should both trigger a meta-flagged shortcut.
      const pressedMeta = e.metaKey || e.ctrlKey;
      if (pressedMeta !== wantMeta) return;
      if (e.shiftKey !== wantShift) return;
      if (e.altKey !== wantAlt) return;
      if (e.key.toLowerCase() !== wantedKey) return;
      handlerRef.current(e);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [descriptor.key, descriptor.meta, descriptor.shift, descriptor.alt, enabled]);
}
