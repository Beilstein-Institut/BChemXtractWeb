/**
 * Toggle — tests for the Phase 3 Liquid Glass state primitive (Task 5).
 *
 * Covers: render, data-slot + data-variant + data-size contracts, toggle
 * behavior (data-pressed flips, onPressedChange fires), disabled
 * suppression, variant class resolution (default, outline), size class
 * resolution, plan-specified pressed-fill (data-pressed:bg-primary), and
 * focus-visible ring class.
 *
 * Base UI Toggle emits `data-pressed` when active (confirmed from
 * `ToggleDataAttributes.d.ts`).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toggle } from "@/components/ui/toggle";

describe("Toggle", () => {
  it("renders a button", () => {
    render(<Toggle>Bold</Toggle>);
    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
  });

  it("exposes data-slot=\"toggle\"", () => {
    render(<Toggle>x</Toggle>);
    expect(screen.getByRole("button").getAttribute("data-slot")).toBe("toggle");
  });

  it("defaults data-variant to \"default\" and data-size to \"default\"", () => {
    render(<Toggle>x</Toggle>);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("data-variant")).toBe("default");
    expect(btn.getAttribute("data-size")).toBe("default");
  });

  it("toggles data-pressed when clicked (uncontrolled)", () => {
    render(<Toggle>x</Toggle>);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("data-pressed")).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute("data-pressed")).toBe("");
  });

  it("fires onPressedChange with the new value", () => {
    const onChange = vi.fn();
    render(<Toggle onPressedChange={onChange}>x</Toggle>);
    fireEvent.click(screen.getByRole("button"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe(true);
  });

  it("does not toggle when disabled", () => {
    const onChange = vi.fn();
    render(
      <Toggle disabled onPressedChange={onChange}>
        x
      </Toggle>
    );
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(onChange).not.toHaveBeenCalled();
    expect(btn.getAttribute("data-pressed")).toBeNull();
  });

  it("applies the primary-fill class via data-pressed selector", () => {
    render(<Toggle>x</Toggle>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("data-pressed:bg-primary");
    expect(btn.className).toContain("data-pressed:text-primary-foreground");
  });

  it("resolves the outline variant to bordered transparent utilities", () => {
    render(<Toggle variant="outline">x</Toggle>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("border-border");
    expect(btn.className).toContain("bg-transparent");
  });

  it("resolves the default variant to transparent background", () => {
    render(<Toggle>x</Toggle>);
    expect(screen.getByRole("button").className).toContain("bg-transparent");
  });

  it("resolves the sm size height", () => {
    render(<Toggle size="sm">x</Toggle>);
    expect(screen.getByRole("button").className).toContain("h-8");
  });

  it("resolves the default size height", () => {
    render(<Toggle>x</Toggle>);
    expect(screen.getByRole("button").className).toContain("h-10");
  });

  it("resolves the lg size height", () => {
    render(<Toggle size="lg">x</Toggle>);
    expect(screen.getByRole("button").className).toContain("h-12");
  });

  it("applies focus-visible ring class", () => {
    render(<Toggle>x</Toggle>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("focus-visible:ring-2");
    expect(btn.className).toContain("focus-visible:ring-ring");
  });

  it("forwards className", () => {
    render(<Toggle className="my-toggle">x</Toggle>);
    expect(screen.getByRole("button").className).toContain("my-toggle");
  });
});
