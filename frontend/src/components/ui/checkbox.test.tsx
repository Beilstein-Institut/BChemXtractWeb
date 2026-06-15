/**
 * Checkbox — tests for the Liquid Glass state primitive.
 *
 * Covers: render, data-slot on Root + Indicator, toggle behavior
 * (data-checked flips, onCheckedChange fires), disabled suppression,
 * ARIA checked attribute, styling (bg-surface-muted,
 * border-border, rounded-sm, data-checked:bg-primary), and the
 * focus-visible ring class.
 *
 * Base UI Checkbox emits `data-checked` when checked (confirmed from
 * `CheckboxRootDataAttributes.d.ts`).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Checkbox } from "@/components/ui/checkbox";

describe("Checkbox", () => {
  it("renders a checkbox role element", () => {
    render(<Checkbox />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it('exposes data-slot="checkbox" on the root', () => {
    render(<Checkbox />);
    expect(screen.getByRole("checkbox").getAttribute("data-slot")).toBe("checkbox");
  });

  it("exposes aria-checked on the root", () => {
    render(<Checkbox />);
    const cb = screen.getByRole("checkbox");
    // Base UI sets aria-checked; it is "false" when unchecked.
    expect(cb.getAttribute("aria-checked")).toBe("false");
  });

  it("toggles data-checked when clicked (uncontrolled)", () => {
    render(<Checkbox />);
    const cb = screen.getByRole("checkbox");
    expect(cb.getAttribute("data-checked")).toBeNull();
    fireEvent.click(cb);
    expect(cb.getAttribute("data-checked")).toBe("");
    expect(cb.getAttribute("aria-checked")).toBe("true");
  });

  it("fires onCheckedChange with the new value", () => {
    const onChange = vi.fn();
    render(<Checkbox onCheckedChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe(true);
  });

  it("does not toggle when disabled", () => {
    const onChange = vi.fn();
    render(<Checkbox disabled onCheckedChange={onChange} />);
    const cb = screen.getByRole("checkbox");
    fireEvent.click(cb);
    expect(onChange).not.toHaveBeenCalled();
    expect(cb.getAttribute("data-checked")).toBeNull();
  });

  it("applies the state-tier surface classes", () => {
    render(<Checkbox />);
    const cb = screen.getByRole("checkbox");
    expect(cb.className).toContain("bg-surface-muted");
    expect(cb.className).toContain("border-border");
    expect(cb.className).toContain("rounded-sm");
  });

  it("applies the primary-fill class via data-checked selector", () => {
    render(<Checkbox />);
    const cb = screen.getByRole("checkbox");
    expect(cb.className).toContain("data-checked:bg-primary");
    expect(cb.className).toContain("data-checked:border-primary");
  });

  it("applies focus-visible ring class", () => {
    render(<Checkbox />);
    const cb = screen.getByRole("checkbox");
    expect(cb.className).toContain("focus-visible:ring-2");
    expect(cb.className).toContain("focus-visible:ring-ring");
  });

  it('mounts the Indicator element with data-slot="checkbox-indicator"', () => {
    const { container } = render(<Checkbox defaultChecked />);
    const indicator = container.querySelector('[data-slot="checkbox-indicator"]');
    expect(indicator).not.toBeNull();
  });
});
