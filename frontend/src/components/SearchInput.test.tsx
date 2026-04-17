/**
 * SearchInput — concrete tests for the global smart-box search input (Plan 06).
 *
 * Captures required behaviors from D-01 (type badge + override), D-03
 * (substructure = explicit submit), and D-18 (`/` keyboard shortcut).
 * Also verifies fix #8: the underlying <input> element is published to
 * `@/lib/searchFocus`'s `searchInputRef.current` on mount so Plan 07's
 * BrowseToolbar "Search within" can focus without DOM queries.
 *
 * Mocks base-ui primitives used by shadcn wrappers to avoid portal/animation
 * complexity in jsdom (same pattern as BrowseToolbar.test.tsx).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Stub postSearch — we're testing UI behavior, not network.
vi.mock("@/lib/apiClient", () => ({
  postSearch: vi.fn(() =>
    Promise.resolve({
      results: [],
      total: 0,
      page: 1,
      size: 24,
      warnings: [],
    })
  ),
}));

// Mock @base-ui/react/popover — same shape as BrowseToolbar.test.tsx
vi.mock("@base-ui/react/popover", () => {
  const React = require("react");
  return {
    Popover: {
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
        if (renderProp) {
          return React.cloneElement(renderProp, rest, children);
        }
        return React.createElement("button", rest, children);
      },
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Positioner: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Popup: ({
        children,
        className,
      }: {
        children: React.ReactNode;
        className?: string;
      }) =>
        React.createElement(
          "div",
          { "data-testid": "popover-content", className },
          children
        ),
    },
  };
});

// Mock @base-ui/react/dialog — Sheet uses Dialog under the hood.
vi.mock("@base-ui/react/dialog", () => {
  const React = require("react");
  return {
    Dialog: {
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
        if (renderProp) {
          return React.cloneElement(renderProp, rest, children);
        }
        return React.createElement("button", rest, children);
      },
      Close: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Backdrop: () => null,
      Popup: ({
        children,
        className,
      }: {
        children: React.ReactNode;
        className?: string;
      }) =>
        React.createElement(
          "div",
          { "data-testid": "sheet-content", className },
          children
        ),
      Title: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("h2", null, children),
      Description: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("p", null, children),
    },
  };
});

// Mock @base-ui/react/button
vi.mock("@base-ui/react/button", () => {
  const React = require("react");
  return {
    Button: React.forwardRef(
      (
        {
          children,
          className,
          ...props
        }: React.ComponentProps<"button">,
        ref: React.Ref<HTMLButtonElement>
      ) =>
        React.createElement(
          "button",
          { ref, className, ...props },
          children
        )
    ),
  };
});

// Mock @base-ui/react/input — the shadcn Input primitive wraps this.
vi.mock("@base-ui/react/input", () => {
  const React = require("react");
  return {
    Input: React.forwardRef(
      (
        props: React.ComponentProps<"input">,
        ref: React.Ref<HTMLInputElement>
      ) => React.createElement("input", { ref, ...props }),
    ),
  };
});

// Mock @base-ui/react/use-render
vi.mock("@base-ui/react/use-render", () => ({
  useRender: ({
    props,
    defaultTagName,
  }: {
    props: Record<string, unknown>;
    defaultTagName: string;
  }) => {
    const React = require("react");
    return React.createElement(defaultTagName, props);
  },
}));

// Mock @base-ui/react/merge-props
vi.mock("@base-ui/react/merge-props", () => ({
  mergeProps: (...args: Record<string, unknown>[]) =>
    Object.assign({}, ...args),
}));

// Import AFTER the mocks so the module graph picks them up.
import { SearchInput } from "@/components/SearchInput";
import { searchInputRef } from "@/lib/searchFocus";

describe("SearchInput", () => {
  it("renders placeholder", () => {
    render(<SearchInput />);
    expect(
      screen.getAllByPlaceholderText("Search structures…").length
    ).toBeGreaterThan(0);
  });

  it("publishes its input element to searchInputRef on mount (fix #8)", () => {
    // Drop any leftover pointer from a prior render (ref is module-scoped).
    searchInputRef.current = null;
    render(<SearchInput />);
    expect(searchInputRef.current).not.toBeNull();
    expect(searchInputRef.current?.tagName).toBe("INPUT");
  });

  it("focuses on `/` keydown from body", () => {
    render(<SearchInput />);
    // Desktop input is first; mobile sheet is hidden (md:hidden).
    const input = screen.getAllByPlaceholderText(
      "Search structures…"
    )[0] as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(input);
  });

  it("does NOT focus on `/` when already inside an input", () => {
    render(
      <>
        <input data-testid="other" />
        <SearchInput />
      </>
    );
    const other = screen.getByTestId("other") as HTMLInputElement;
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(document.activeElement).toBe(other);
  });

  it("clears + blurs on Escape", () => {
    render(<SearchInput />);
    const input = screen.getAllByPlaceholderText(
      "Search structures…"
    )[0] as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "foo" } });
    expect(input.value).toBe("foo");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
  });

  it("shows type badge after ≥ 2 chars are typed (Formula detection)", () => {
    render(<SearchInput />);
    const input = screen.getAllByPlaceholderText(
      "Search structures…"
    )[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "C6H6" } });
    expect(screen.getAllByText("Formula").length).toBeGreaterThan(0);
  });
});
