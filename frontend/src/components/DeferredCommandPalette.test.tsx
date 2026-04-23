/**
 * Tests for DeferredCommandPalette — the bundle-size wrapper that
 * defers <CommandPalette /> mount until first ⌘K.
 *
 * We mock the lazy import so jsdom can exercise the activation flow
 * synchronously. Invariants:
 *   1. Before activation, nothing is mounted (the lazy chunk is NOT
 *      requested).
 *   2. After ⌘K (or Ctrl+K), the real palette mounts and receives
 *      initiallyOpen=true so the first press both loads AND opens it.
 *   3. Unrelated keystrokes do not trigger activation.
 *   4. After activation, the wrapper stops listening (no double-mount).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the real CommandPalette module so we can assert on whether it
// was rendered and what props it received, without loading motion/react.
vi.mock("./CommandPalette", () => ({
  CommandPalette: ({ initiallyOpen }: { initiallyOpen?: boolean }) => (
    <div
      data-slot="command-palette-mock"
      data-initially-open={initiallyOpen ? "true" : "false"}
    >
      command palette mock
    </div>
  ),
}));

import { DeferredCommandPalette } from "./DeferredCommandPalette";

describe("DeferredCommandPalette", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing before the activator keystroke", () => {
    const { container } = render(<DeferredCommandPalette />);
    expect(container.querySelector('[data-slot="command-palette-mock"]')).toBeNull();
  });

  it("mounts the real palette with initiallyOpen after ⌘K", async () => {
    render(<DeferredCommandPalette />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const palette = await screen.findByText("command palette mock");
    expect(palette.getAttribute("data-initially-open")).toBe("true");
  });

  it("also activates on Ctrl+K (non-macOS)", async () => {
    render(<DeferredCommandPalette />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await screen.findByText("command palette mock");
  });

  it("ignores unrelated keystrokes", () => {
    const { container } = render(<DeferredCommandPalette />);
    fireEvent.keyDown(window, { key: "k" }); // no modifier
    fireEvent.keyDown(window, { key: "a", metaKey: true }); // wrong letter
    expect(container.querySelector('[data-slot="command-palette-mock"]')).toBeNull();
  });

  it("does not re-trigger after activation (listener is removed)", async () => {
    render(<DeferredCommandPalette />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await screen.findByText("command palette mock");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() => {
      const nodes = document.querySelectorAll('[data-slot="command-palette-mock"]');
      expect(nodes.length).toBe(1);
    });
  });
});
