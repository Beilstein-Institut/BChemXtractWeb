/**
 * Tests for ExportMenu component.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * Mocks @base-ui/react/menu and @base-ui/react/tooltip to avoid portal/animation
 * complexity in jsdom.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ExportMenu } from "./ExportMenu";

// Mock @base-ui/react/menu (used by DropdownMenu primitives)
vi.mock("@base-ui/react/menu", () => {
  const React = require("react");

  // Minimal stateful menu root that tracks open state
  const Root = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  // Trigger renders its children — clicking it is not needed since
  // tests click the child Button directly via role="button"
  const Trigger = ({
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
  };

  const Portal = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  const Positioner = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  // Popup is always rendered (simulates open dropdown)
  const Popup = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) =>
    React.createElement("div", { "data-testid": "dropdown-content", className }, children);

  const Item = ({
    children,
    className,
    onClick,
    "aria-disabled": ariaDisabled,
    ...rest
  }: {
    children?: React.ReactNode;
    className?: string;
    onClick?: React.MouseEventHandler;
    "aria-disabled"?: string | boolean;
    [key: string]: unknown;
  }) =>
    React.createElement(
      "div",
      {
        role: "menuitem",
        className,
        onClick,
        "aria-disabled": ariaDisabled,
        ...rest,
      },
      children
    );

  const GroupLabel = ({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
  }) => React.createElement("div", { className }, children);

  const Separator = ({ className }: { className?: string }) =>
    React.createElement("hr", { className });

  const Group = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  const SubmenuRoot = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  const SubmenuTrigger = ({ children }: { children: React.ReactNode }) =>
    React.createElement("button", null, children);

  const RadioGroup = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  const RadioItem = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { role: "menuitemradio" }, children);

  const RadioItemIndicator = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  const CheckboxItem = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { role: "menuitemcheckbox" }, children);

  const CheckboxItemIndicator = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  return {
    Menu: {
      Root,
      Trigger,
      Portal,
      Positioner,
      Popup,
      Item,
      GroupLabel,
      Separator,
      Group,
      SubmenuRoot,
      SubmenuTrigger,
      RadioGroup,
      RadioItem,
      RadioItemIndicator,
      CheckboxItem,
      CheckboxItemIndicator,
    },
  };
});

// Mock @base-ui/react/tooltip
vi.mock("@base-ui/react/tooltip", () => {
  const React = require("react");
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
        if (renderProp) {
          return React.cloneElement(renderProp, rest, children);
        }
        return React.createElement("span", rest, children);
      },
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Positioner: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Popup: ({ children }: { children: React.ReactNode }) =>
        React.createElement("div", { "data-testid": "tooltip-content" }, children),
      Arrow: () => null,
    },
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

// Mock @base-ui/react/button
vi.mock("@base-ui/react/button", () => {
  const React = require("react");
  return {
    Button: React.forwardRef(
      (
        { children, className, ...props }: React.ComponentProps<"button">,
        ref: React.Ref<HTMLButtonElement>
      ) => React.createElement("button", { ref, className, ...props }, children)
    ),
  };
});

describe("ExportMenu", () => {
  it("renders trigger button with default label", () => {
    render(<ExportMenu onExport={vi.fn()} />);
    expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument();
  });

  it("renders trigger with custom label", () => {
    render(<ExportMenu onExport={vi.fn()} triggerLabel="Export 5 selected" />);
    expect(screen.getByText("Export 5 selected")).toBeInTheDocument();
  });

  it("calls onExport with correct format when SDF item clicked", async () => {
    const onExport = vi.fn();
    render(<ExportMenu onExport={onExport} />);
    await userEvent.click(screen.getByText("SDF / MOL"));
    expect(onExport).toHaveBeenCalledWith("sdf");
  });

  it("calls onExport with json when JSON item clicked", async () => {
    const onExport = vi.fn();
    render(<ExportMenu onExport={onExport} />);
    await userEvent.click(screen.getByText("JSON"));
    expect(onExport).toHaveBeenCalledWith("json");
  });

  it("renders all 7 active format items", () => {
    render(<ExportMenu onExport={vi.fn()} />);
    expect(screen.getByText("SDF / MOL")).toBeInTheDocument();
    expect(screen.getByText("JSON")).toBeInTheDocument();
    expect(screen.getByText("CSV")).toBeInTheDocument();
    expect(screen.getByText("PNG Images")).toBeInTheDocument();
    expect(screen.getByText("SVG Images")).toBeInTheDocument();
    expect(screen.getByText("CML")).toBeInTheDocument();
    expect(screen.getByText("MDL V3000")).toBeInTheDocument();
  });

  it("renders RXN/RDfile item as disabled", () => {
    render(<ExportMenu onExport={vi.fn()} />);
    const rxnItem = screen.getByText("RXN / RDfile");
    expect(rxnItem.closest("[aria-disabled='true']")).toBeTruthy();
  });

  it("does not call onExport when RXN/RDfile is clicked (disabled)", async () => {
    const onExport = vi.fn();
    render(<ExportMenu onExport={onExport} />);
    // pointer-events-none means userEvent click may not trigger onClick — but no call is the assertion
    const rxnItem = screen.getByText("RXN / RDfile");
    // Try clicking the parent disabled item
    const disabledItem = rxnItem.closest("[aria-disabled='true']");
    if (disabledItem) {
      await userEvent.click(disabledItem as HTMLElement);
    }
    expect(onExport).not.toHaveBeenCalledWith("rxn");
  });

  it("icon variant renders DownloadIcon button without text label", () => {
    render(<ExportMenu onExport={vi.fn()} triggerVariant="icon" />);
    expect(
      screen.getByRole("button", { name: "Export structure" })
    ).toBeInTheDocument();
    // No standalone "Export" text button visible
    expect(screen.queryByRole("button", { name: /^export$/i })).not.toBeInTheDocument();
  });

  it("disabled prop disables the trigger button", () => {
    render(<ExportMenu onExport={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: /export/i })).toBeDisabled();
  });

  // ==========================================================================
  // Plan 10-05 Task 5.2 — D-22 / UI-SPEC §7: reactionsAvailable prop
  // ==========================================================================

  it("RXN item is aria-disabled when reactionsAvailable is false (default)", () => {
    render(<ExportMenu onExport={vi.fn()} />);
    const rxnItem = screen.getByText("RXN / RDfile");
    expect(rxnItem.closest("[aria-disabled='true']")).toBeTruthy();
  });

  it("RXN item is NOT aria-disabled when reactionsAvailable=true", () => {
    render(<ExportMenu onExport={vi.fn()} reactionsAvailable />);
    const rxnItem = screen.getByText("RXN / RDfile");
    // Should no longer be inside an aria-disabled wrapper
    expect(rxnItem.closest("[aria-disabled='true']")).toBeNull();
  });

  it("clicking RXN item with reactionsAvailable=true fires onExport('rxn')", async () => {
    const onExport = vi.fn();
    render(<ExportMenu onExport={onExport} reactionsAvailable />);
    await userEvent.click(screen.getByText("RXN / RDfile"));
    expect(onExport).toHaveBeenCalledWith("rxn");
  });
});
