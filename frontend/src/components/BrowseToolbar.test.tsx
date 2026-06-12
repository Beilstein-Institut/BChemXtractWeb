/**
 * Tests for BrowseToolbar component.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * Mocks base-ui primitives used by shadcn wrappers to avoid portal/animation
 * complexity in jsdom.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { BrowseToolbar } from "./BrowseToolbar";

// Mock @base-ui/react/toggle-group
vi.mock("@base-ui/react/toggle-group", () => {
  const React = require("react");
  return {
    ToggleGroup: ({
      children,
      value,
      ...rest
    }: {
      children?: React.ReactNode;
      value?: string;
      [key: string]: unknown;
    }) =>
      React.createElement(
        "div",
        { "data-testid": "toggle-group", "data-value": value, ...rest },
        children,
      ),
  };
});

// Mock @base-ui/react/toggle
vi.mock("@base-ui/react/toggle", () => {
  const React = require("react");
  return {
    Toggle: ({
      children,
      value,
      "aria-label": ariaLabel,
      ...rest
    }: {
      children?: React.ReactNode;
      value?: string;
      "aria-label"?: string;
      [key: string]: unknown;
    }) =>
      React.createElement(
        "button",
        { "data-testid": `toggle-${value}`, "aria-label": ariaLabel, ...rest },
        children,
      ),
  };
});

// Mock @base-ui/react/select
vi.mock("@base-ui/react/select", () => {
  const React = require("react");
  return {
    Select: {
      Root: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Trigger: ({
        children,
        "aria-label": ariaLabel,
        className,
      }: {
        children?: React.ReactNode;
        "aria-label"?: string;
        className?: string;
        [key: string]: unknown;
      }) => React.createElement("button", { "aria-label": ariaLabel, className }, children),
      Value: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("span", null, children),
      Icon: () => null,
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Positioner: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Popup: ({ children }: { children: React.ReactNode }) =>
        React.createElement("div", { "data-testid": "select-popup" }, children),
      List: ({ children }: { children: React.ReactNode }) =>
        React.createElement("ul", null, children),
      Group: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Item: ({ children, value }: { children?: React.ReactNode; value?: string }) =>
        React.createElement("li", { "data-value": value }, children),
      ItemText: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("span", null, children),
      ItemIndicator: () => null,
      GroupLabel: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("span", null, children),
      Separator: () => React.createElement("hr"),
      ScrollUpArrow: () => null,
      ScrollDownArrow: () => null,
    },
  };
});

// Mock @base-ui/react/popover
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
      Popup: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("div", { "data-testid": "popover-content", className }, children),
    },
  };
});

// Mock @base-ui/react/button to a simple <button>
vi.mock("@base-ui/react/button", () => {
  const React = require("react");
  return {
    Button: React.forwardRef(
      (
        { children, className, ...props }: React.ComponentProps<"button">,
        ref: React.Ref<HTMLButtonElement>,
      ) => React.createElement("button", { ref, className, ...props }, children),
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
  mergeProps: (...args: Record<string, unknown>[]) => Object.assign({}, ...args),
}));

const defaultProps = {
  view: "grid" as const,
  onViewChange: vi.fn(),
  sort: "extraction_order" as const,
  onSortChange: vi.fn(),
  pageSize: 12 as const,
  onPageSizeChange: vi.fn(),
  total: 87,
  currentPage: 1,
  selectedCount: 0,
};

describe("BrowseToolbar", () => {
  it("renders grid and table toggle buttons", () => {
    render(<BrowseToolbar {...defaultProps} />);
    expect(screen.getByLabelText("Grid view")).toBeTruthy();
    expect(screen.getByLabelText("Table view")).toBeTruthy();
  });

  it("renders sort select trigger", () => {
    render(<BrowseToolbar {...defaultProps} />);
    // Sort by label text
    const sortLabels = screen.getAllByText("Sort by");
    expect(sortLabels.length).toBeGreaterThan(0);
  });

  it("renders page size select trigger", () => {
    render(<BrowseToolbar {...defaultProps} />);
    const perPageLabels = screen.getAllByText("Per page");
    expect(perPageLabels.length).toBeGreaterThan(0);
  });

  it("renders the structure count label with role=status", () => {
    render(<BrowseToolbar {...defaultProps} />);
    const status = screen.getByRole("status");
    expect(status).toBeTruthy();
    expect(status.textContent).toContain("87");
  });

  it("shows correct count label for multiple structures", () => {
    render(<BrowseToolbar {...defaultProps} total={87} currentPage={1} pageSize={12} />);
    const status = screen.getByRole("status");
    // Showing 1–12 of 87 structures
    expect(status.textContent).toMatch(/1/);
    expect(status.textContent).toMatch(/87/);
  });

  it("shows 'No structures' when total is 0", () => {
    render(<BrowseToolbar {...defaultProps} total={0} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("No structures");
  });

  it("shows 'N selected' badge only when selectedCount > 0", () => {
    const { rerender } = render(<BrowseToolbar {...defaultProps} selectedCount={0} />);
    expect(screen.queryByText(/selected/)).toBeNull();

    rerender(<BrowseToolbar {...defaultProps} selectedCount={3} />);
    expect(screen.getByText("3 selected")).toBeTruthy();
  });

  it("does not show selection badge when selectedCount is 0", () => {
    render(<BrowseToolbar {...defaultProps} selectedCount={0} />);
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it("applies opacity and pointer-events-none when disabled", () => {
    const { container } = render(<BrowseToolbar {...defaultProps} disabled={true} />);
    const toolbar = container.firstChild as HTMLElement;
    expect(toolbar.className).toMatch(/opacity-50/);
    expect(toolbar.className).toMatch(/pointer-events-none/);
  });

  describe("depiction toggle", () => {
    const depictionProps = {
      ...defaultProps,
      selectedIds: new Set<number>(),
      extractionId: 42,
      depiction: "cdx" as const,
      onDepictionChange: vi.fn(),
    };

    it("renders ChemDraw and CDK options when onDepictionChange is provided", () => {
      render(<BrowseToolbar {...depictionProps} />);
      expect(screen.getByLabelText(/ChemDraw depiction/)).toBeTruthy();
      expect(screen.getByLabelText(/CDK depiction/)).toBeTruthy();
    });

    it("marks ChemDraw as pressed by default", () => {
      const { container } = render(<BrowseToolbar {...depictionProps} />);
      const group = container.querySelector('[data-slot="depiction-toggle"]');
      expect(group?.getAttribute("data-depiction")).toBe("cdx");
      expect(screen.getByLabelText(/ChemDraw depiction/).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByLabelText(/CDK depiction/).getAttribute("aria-pressed")).toBe("false");
    });

    it("fires onDepictionChange('cdk') when the CDK segment is clicked", () => {
      const onDepictionChange = vi.fn();
      render(<BrowseToolbar {...depictionProps} onDepictionChange={onDepictionChange} />);
      fireEvent.click(screen.getByLabelText(/CDK depiction/));
      expect(onDepictionChange).toHaveBeenCalledWith("cdk");
    });

    it("does not fire when the already-active segment is clicked", () => {
      const onDepictionChange = vi.fn();
      render(<BrowseToolbar {...depictionProps} onDepictionChange={onDepictionChange} />);
      fireEvent.click(screen.getByLabelText(/ChemDraw depiction/));
      expect(onDepictionChange).not.toHaveBeenCalled();
    });

    it("renders the sliding indicator", () => {
      const { container } = render(<BrowseToolbar {...depictionProps} />);
      expect(container.querySelector('[data-slot="depiction-toggle-indicator"]')).not.toBeNull();
    });

    it("is hidden when no onDepictionChange handler is provided", () => {
      render(<BrowseToolbar {...defaultProps} />);
      expect(screen.queryByLabelText(/ChemDraw depiction/)).toBeNull();
      expect(screen.queryByLabelText(/CDK depiction/)).toBeNull();
    });
  });
});
