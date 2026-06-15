/**
 * CommandPalette — Spotlight-style rebuild tests.
 *
 * Covers the behaviour we can meaningfully exercise in jsdom:
 *   - ⌘K / Ctrl+K toggle the palette open/closed
 *   - Esc closes
 *   - Typing filters the commands list
 *   - Clicking a shortcut tile or a filtered command row fires its
 *     action and closes the palette
 *   - data-slot contract for the palette root, search input, shortcut
 *     grid, and results list all present as downstream selectors
 *
 * Motion is mocked so `motion.div` / `motion.button` render as plain
 * HTML and `AnimatePresence` is a passthrough — otherwise the spring
 * entrance would leave the palette out of the document while the test
 * asserts against it.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock motion/react so the palette renders synchronously without any
// entrance animation gating test assertions.
vi.mock("motion/react", async () => {
  const React = await import("react");
  type AnyProps = Record<string, unknown> & {
    children?: React.ReactNode;
    // Known motion-only props to strip before reaching the DOM.
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    transition?: unknown;
    variants?: unknown;
    whileHover?: unknown;
    whileTap?: unknown;
    layout?: unknown;
    layoutId?: unknown;
  };
  function stripMotionProps(props: AnyProps) {
    const {
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      variants: _variants,
      whileHover: _whileHover,
      whileTap: _whileTap,
      layout: _layout,
      layoutId: _layoutId,
      ...rest
    } = props;
    void _initial;
    void _animate;
    void _exit;
    void _transition;
    void _variants;
    void _whileHover;
    void _whileTap;
    void _layout;
    void _layoutId;
    return rest;
  }
  const motion = new Proxy(
    {},
    {
      get: (_target, key) => {
        const tag = typeof key === "string" ? key : "div";
        return (props: AnyProps) => React.createElement(tag, stripMotionProps(props));
      },
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => true,
  };
});

// Mock the router — real navigate() pushes to window.history.
vi.mock("@/lib/router", () => ({
  navigate: vi.fn(),
  useRoute: () => "/",
  ROUTE_CHANGE_EVENT: "routechange",
}));

// Capture setTheme.
const setThemeMock = vi.fn();
vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ theme: "system", setTheme: setThemeMock }),
}));
vi.mock("@/components/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { navigate } from "@/lib/router";
import { CommandPalette } from "./CommandPalette";

/** Dispatch a matching Cmd/Ctrl+K event on window. */
function pressMetaK(meta = true) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: meta,
        ctrlKey: !meta,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

/** Dispatch Escape on window (captured by the in-palette effect). */
function pressEscape() {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders nothing before ⌘K is pressed", () => {
    render(<CommandPalette />);
    expect(document.querySelector('[data-slot="command-palette"]')).toBeNull();
  });

  it("opens on Cmd+K", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    expect(document.querySelector('[data-slot="command-palette"]')).not.toBeNull();
  });

  it("also opens on Ctrl+K (cross-platform)", () => {
    render(<CommandPalette />);
    pressMetaK(false);
    expect(document.querySelector('[data-slot="command-palette"]')).not.toBeNull();
  });

  it("a second ⌘K toggles the palette closed", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    expect(document.querySelector('[data-slot="command-palette"]')).not.toBeNull();
    pressMetaK(true);
    expect(document.querySelector('[data-slot="command-palette"]')).toBeNull();
  });

  it("closes on Escape", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    expect(document.querySelector('[data-slot="command-palette"]')).not.toBeNull();
    pressEscape();
    expect(document.querySelector('[data-slot="command-palette"]')).toBeNull();
  });

  it("renders the search input with data-slot hook", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    const input = document.querySelector(
      '[data-slot="command-palette-input"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.getAttribute("placeholder")).toMatch(/search commands/i);
  });

  it("shows the four chemistry shortcut tiles when query is empty", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    expect(document.querySelector('[data-slot="command-palette-shortcuts"]')).not.toBeNull();
    expect(screen.getByText("Extract")).toBeInTheDocument();
    expect(screen.getByText("Browse")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
  });

  it("typing switches to filtered results and hides the shortcut grid", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    const input = document.querySelector('[data-slot="command-palette-input"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "browse" } });
    expect(document.querySelector('[data-slot="command-palette-shortcuts"]')).toBeNull();
    expect(document.querySelector('[data-slot="command-palette-results"]')).not.toBeNull();
    expect(screen.getByText("Go to Browse")).toBeInTheDocument();
  });

  it("renders an empty state when no commands match the query", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    const input = document.querySelector('[data-slot="command-palette-input"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzzzzz-nomatch" } });
    const empty = document.querySelector('[data-slot="command-palette-empty"]');
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toMatch(/no commands match/i);
  });

  it("clicking the Browse shortcut navigates and closes", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    const tile = document.querySelector(
      '[data-slot="command-item"][data-value="nav-browse"]',
    ) as HTMLButtonElement;
    expect(tile).not.toBeNull();
    fireEvent.click(tile);
    expect(vi.mocked(navigate)).toHaveBeenCalledWith("/browse");
    expect(document.querySelector('[data-slot="command-palette"]')).toBeNull();
  });

  it("clicking a filtered theme result calls setTheme and closes", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    const input = document.querySelector('[data-slot="command-palette-input"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "dark" } });
    fireEvent.click(screen.getByText("Dark theme"));
    expect(setThemeMock).toHaveBeenCalledWith("dark");
    expect(document.querySelector('[data-slot="command-palette"]')).toBeNull();
  });

  it("each filtered result exposes data-slot='command-item' with data-value", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    const input = document.querySelector('[data-slot="command-palette-input"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "go to" } });
    const items = document.querySelectorAll('[data-slot="command-item"]');
    expect(items.length).toBeGreaterThan(0);
    const values = Array.from(items).map((el) => el.getAttribute("data-value"));
    expect(values).toContain("nav-extract");
    expect(values).toContain("nav-browse");
    expect(values).toContain("nav-history");
    expect(values).toContain("nav-about");
  });
});
