/**
 * CommandPalette — component tests.
 *
 * Focuses on the observable behaviour we can reasonably exercise in jsdom:
 *  - ⌘K (and Ctrl+K) toggles the palette open/closed
 *  - Escape closes it (relying on the `cmdk` built-in)
 *  - Navigation items dispatch navigate() and close the palette
 *  - Theme items call setTheme and close the palette
 *  - data-slot contract for the palette root + input
 *
 * We stub the heavier Base UI dialog/tooltip portals so rendered content
 * stays in the document tree.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// jsdom doesn't ship ResizeObserver; cmdk references it during mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
  ResizeObserverStub;

// jsdom elements don't have scrollIntoView — cmdk calls it when focusing
// a newly-selected item. Stub to a no-op so the mount doesn't throw.
if (!("scrollIntoView" in Element.prototype)) {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    writable: true,
    configurable: true,
    value: () => {},
  });
}

// Mock the Base UI Dialog root so the portal always renders children inline.
vi.mock("@base-ui/react/dialog", async () => {
  const React = await import("react");
  return {
    Dialog: {
      Root: ({
        open,
        children,
      }: {
        open?: boolean;
        onOpenChange?: (v: boolean) => void;
        children: React.ReactNode;
      }) =>
        open === false
          ? null
          : React.createElement(React.Fragment, null, children),
      Trigger: ({
        children,
        render: renderProp,
        ...rest
      }: {
        children?: React.ReactNode;
        render?: React.ReactElement;
        [key: string]: unknown;
      }) => {
        if (renderProp) return React.cloneElement(renderProp, rest, children);
        return React.createElement(React.Fragment, null, children);
      },
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Backdrop: ({ className }: { className?: string }) =>
        React.createElement("div", {
          "data-testid": "dialog-backdrop",
          className,
        }),
      Popup: ({
        children,
        className,
      }: {
        children: React.ReactNode;
        className?: string;
      }) =>
        React.createElement(
          "div",
          {
            "data-testid": "dialog-popup",
            role: "dialog",
            className,
          },
          children,
        ),
      Close: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(
          "button",
          { "data-testid": "dialog-close" },
          children ?? null,
        ),
      Title: ({
        children,
        className,
      }: {
        children: React.ReactNode;
        className?: string;
      }) =>
        React.createElement(
          "h2",
          { "data-testid": "dialog-title", className },
          children,
        ),
      Description: ({
        children,
        className,
      }: {
        children: React.ReactNode;
        className?: string;
      }) =>
        React.createElement(
          "p",
          { "data-testid": "dialog-description", className },
          children,
        ),
    },
  };
});

vi.mock("@base-ui/react/tooltip", async () => {
  const React = await import("react");
  return {
    Tooltip: {
      Provider: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Root: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Trigger: ({
        children,
        render: renderProp,
        ...rest
      }: {
        children?: React.ReactNode;
        render?: React.ReactElement;
        [key: string]: unknown;
      }) => {
        if (renderProp) return React.cloneElement(renderProp, rest, children);
        return React.createElement(React.Fragment, null, children);
      },
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Positioner: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Popup: ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          "div",
          { "data-testid": "tooltip-content" },
          children,
        ),
      Arrow: () => null,
    },
  };
});

vi.mock("@base-ui/react/button", async () => {
  const React = await import("react");
  return {
    Button: React.forwardRef(
      (
        { children, className, ...props }: React.ComponentProps<"button">,
        ref: React.Ref<HTMLButtonElement>,
      ) =>
        React.createElement(
          "button",
          { ref, className, ...props },
          children,
        ),
    ),
  };
});

// Mock the router navigate — the real one pushes to window.history.
vi.mock("@/lib/router", () => ({
  navigate: vi.fn(),
  useRoute: () => "/",
  ROUTE_CHANGE_EVENT: "routechange",
}));

// Also capture setTheme from the theme provider.
const setThemeMock = vi.fn();
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "system", setTheme: setThemeMock }),
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

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Make sure no palette residue leaks between tests.
    document.body.innerHTML = "";
  });

  it("does not render any dialog content before ⌘K is pressed", () => {
    render(<CommandPalette />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on Cmd+K", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("also opens on Ctrl+K (cross-platform)", () => {
    render(<CommandPalette />);
    pressMetaK(false);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("a second ⌘K press closes the palette (toggle)", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    pressMetaK(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders Navigation and Theme groups with data-slot on the palette root", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    const root = document.querySelector('[data-slot="command-palette"]');
    expect(root).not.toBeNull();
    // Group headings ship verbatim — cmdk renders them as [cmdk-group-heading].
    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByText("Theme")).toBeInTheDocument();
  });

  it("shows the four navigation items", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    expect(screen.getByText("Extract")).toBeInTheDocument();
    expect(screen.getByText("Browse")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
  });

  it("clicking 'Browse' calls navigate('/browse') and closes the palette", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    fireEvent.click(screen.getByText("Browse"));
    expect(vi.mocked(navigate)).toHaveBeenCalledWith("/browse");
    // Palette should close after selection.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clicking a theme item calls setTheme with the expected value", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    fireEvent.click(screen.getByText("Dark"));
    expect(setThemeMock).toHaveBeenCalledWith("dark");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the search input with data-slot='command-palette-input'", () => {
    render(<CommandPalette />);
    pressMetaK(true);
    const input = document.querySelector(
      '[data-slot="command-palette-input"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.getAttribute("placeholder")).toMatch(/search commands/i);
  });
});
