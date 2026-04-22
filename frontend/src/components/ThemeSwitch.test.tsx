/**
 * ThemeSwitch — tests for the Phase 3 Liquid Glass theme selector (Task 7).
 *
 * Mocks @base-ui/react/menu + @base-ui/react/button so the popup is always
 * visible in jsdom and every CheckboxItem is clickable. Asserts the
 * current-theme icon, data-slot contract, and that clicking a menu item
 * calls setTheme + persists to localStorage.bchemxtract-theme.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "./theme-provider";
import { ThemeSwitch } from "./ThemeSwitch";

// Mock the Base UI menu so the popup renders inline (no portal/positioning)
// and CheckboxItem surfaces onCheckedChange to a regular click handler.
vi.mock("@base-ui/react/menu", async () => {
  const React = await import("react");

  const Root = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  const Trigger = ({
    render: renderProp,
    children,
    ...rest
  }: {
    render?: React.ReactElement;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => {
    if (renderProp) {
      // Preserve the render element's own props (including data-slot) —
      // Trigger-injected props like onClick are the callers that extend,
      // not replace, caller-supplied identity.
      const merged = {
        ...rest,
        ...(renderProp.props as Record<string, unknown>),
      };
      return React.cloneElement(renderProp, merged, children);
    }
    return React.createElement("button", rest, children);
  };

  const Portal = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  const Positioner = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  const Popup = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) =>
    React.createElement(
      "div",
      { role: "menu", className },
      children,
    );

  const CheckboxItem = ({
    children,
    checked,
    onCheckedChange,
  }: {
    children: React.ReactNode;
    checked?: boolean;
    onCheckedChange?: (next: boolean) => void;
  }) =>
    React.createElement(
      "div",
      {
        role: "menuitemcheckbox",
        "aria-checked": !!checked,
        onClick: () => onCheckedChange?.(!checked),
      },
      children,
    );

  const CheckboxItemIndicator = ({
    children,
  }: {
    children?: React.ReactNode;
  }) => React.createElement(React.Fragment, null, children);

  // Stubs for other primitives that dropdown-menu.tsx references.
  const Item = ({ children, ...rest }: { children: React.ReactNode }) =>
    React.createElement("div", { role: "menuitem", ...rest }, children);
  const Group = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  const GroupLabel = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children);
  const Separator = () => React.createElement("hr", null);
  const SubmenuRoot = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  const SubmenuTrigger = ({ children }: { children: React.ReactNode }) =>
    React.createElement("button", null, children);
  const RadioGroup = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  const RadioItem = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { role: "menuitemradio" }, children);
  const RadioItemIndicator = ({
    children,
  }: {
    children?: React.ReactNode;
  }) => React.createElement(React.Fragment, null, children);

  return {
    Menu: {
      Root,
      Trigger,
      Portal,
      Positioner,
      Popup,
      Item,
      Group,
      GroupLabel,
      Separator,
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

function renderWithProvider() {
  return render(
    <ThemeProvider defaultTheme="system" storageKey="bchemxtract-theme">
      <ThemeSwitch />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
});

describe("ThemeSwitch", () => {
  it("exposes data-slot=\"theme-switch\" on the trigger", () => {
    renderWithProvider();
    const trigger = document.querySelector('[data-slot="theme-switch"]');
    expect(trigger).not.toBeNull();
  });

  it("announces the current theme via aria-label", () => {
    renderWithProvider();
    expect(screen.getByLabelText("Theme: System")).toBeInTheDocument();
  });

  it("renders three menu options (Light / Dark / System)", () => {
    renderWithProvider();
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("clicking Dark persists the theme to localStorage", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Dark"));
    expect(localStorage.getItem("bchemxtract-theme")).toBe("dark");
  });

  it("clicking Light persists the theme to localStorage", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Light"));
    expect(localStorage.getItem("bchemxtract-theme")).toBe("light");
  });

  it("clicking Dark adds the .dark class on <html>", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
