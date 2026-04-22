/**
 * Switch — tests for the Phase 3 Liquid Glass state primitive (Task 5).
 *
 * Covers: render, data-slot contract on Root + Thumb, toggle behavior
 * (data-checked flips, onCheckedChange fires), disabled suppression,
 * plan-specified track/thumb styling (bg-border off, data-checked:bg-primary,
 * bg-white thumb), and focus-visible ring class.
 *
 * Base UI Switch emits `data-checked` when on (confirmed from
 * `SwitchRootDataAttributes.d.ts`).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Switch } from "@/components/ui/switch";

describe("Switch", () => {
  it("renders a switch role element", () => {
    render(<Switch />);
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("exposes data-slot=\"switch\" on the root", () => {
    render(<Switch />);
    expect(screen.getByRole("switch").getAttribute("data-slot")).toBe("switch");
  });

  it("exposes data-slot=\"switch-thumb\" on the thumb", () => {
    const { container } = render(<Switch />);
    const thumb = container.querySelector('[data-slot="switch-thumb"]');
    expect(thumb).not.toBeNull();
  });

  it("toggles data-checked when clicked (uncontrolled)", () => {
    render(<Switch />);
    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("data-checked")).toBeNull();
    fireEvent.click(sw);
    expect(sw.getAttribute("data-checked")).toBe("");
  });

  it("fires onCheckedChange with the new value", () => {
    const onChange = vi.fn();
    render(<Switch onCheckedChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe(true);
  });

  it("does not toggle when disabled", () => {
    const onChange = vi.fn();
    render(<Switch disabled onCheckedChange={onChange} />);
    const sw = screen.getByRole("switch");
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
    expect(sw.getAttribute("data-checked")).toBeNull();
  });

  it("applies the off-state track class bg-border", () => {
    render(<Switch />);
    const sw = screen.getByRole("switch");
    expect(sw.className).toContain("bg-border");
  });

  it("applies the on-state track class via data-checked:bg-primary", () => {
    render(<Switch />);
    const sw = screen.getByRole("switch");
    expect(sw.className).toContain("data-checked:bg-primary");
  });

  it("applies the white thumb class", () => {
    const { container } = render(<Switch />);
    const thumb = container.querySelector(
      '[data-slot="switch-thumb"]'
    ) as HTMLElement;
    expect(thumb.className).toContain("bg-white");
  });

  it("applies a transform transition for the slide animation", () => {
    const { container } = render(<Switch />);
    const thumb = container.querySelector(
      '[data-slot="switch-thumb"]'
    ) as HTMLElement;
    expect(thumb.className).toContain("transition-transform");
    expect(thumb.className).toContain("duration-150");
  });

  it("applies focus-visible ring class", () => {
    render(<Switch />);
    const sw = screen.getByRole("switch");
    expect(sw.className).toContain("focus-visible:ring-2");
    expect(sw.className).toContain("focus-visible:ring-ring");
  });

  it("reflects the chosen size via data-size", () => {
    render(<Switch size="sm" />);
    expect(screen.getByRole("switch").getAttribute("data-size")).toBe("sm");
  });
});
