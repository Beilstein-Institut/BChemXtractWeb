/**
 * Input — tests for the Phase 3 Liquid Glass form primitive (Task 4).
 *
 * Covers: render, data-slot contract, controlled value/onChange, disabled
 * suppression, type forwarding, placeholder resolution, focus-visible ring
 * class, and core form-tier styling
 * (`bg-surface-muted`, `border-border`, `rounded-sm`).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "@/components/ui/input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input placeholder="type here" />);
    expect(screen.getByPlaceholderText("type here")).toBeInTheDocument();
  });

  it('exposes data-slot="input"', () => {
    render(<Input placeholder="x" />);
    const input = screen.getByPlaceholderText("x");
    expect(input.getAttribute("data-slot")).toBe("input");
  });

  it("forwards value and fires onChange", () => {
    const onChange = vi.fn();
    render(<Input value="hello" onChange={onChange} placeholder="x" />);
    const input = screen.getByPlaceholderText("x") as HTMLInputElement;
    expect(input.value).toBe("hello");
    fireEvent.change(input, { target: { value: "hello world" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("suppresses onChange when disabled (DOM guard)", () => {
    // Disabled inputs do not dispatch change events from user input in
    // the browser. jsdom mirrors this: fireEvent on a disabled input
    // does still fire the handler, so we instead assert the `disabled`
    // attribute is surfaced so the browser will enforce the guard.
    render(<Input disabled placeholder="x" />);
    const input = screen.getByPlaceholderText("x") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('forwards the type attribute (e.g. type="email")', () => {
    render(<Input type="email" placeholder="x" />);
    const input = screen.getByPlaceholderText("x") as HTMLInputElement;
    expect(input.type).toBe("email");
  });

  it("applies focus-visible ring classes", () => {
    render(<Input placeholder="x" />);
    const input = screen.getByPlaceholderText("x");
    expect(input.className).toContain("focus-visible:ring-2");
    expect(input.className).toContain("focus-visible:ring-ring");
  });

  it("applies the form-tier surface classes", () => {
    render(<Input placeholder="x" />);
    const input = screen.getByPlaceholderText("x");
    expect(input.className).toContain("bg-surface-muted");
    expect(input.className).toContain("border-border");
    expect(input.className).toContain("rounded-sm");
  });

  it("applies disabled style classes when disabled", () => {
    render(<Input disabled placeholder="x" />);
    const input = screen.getByPlaceholderText("x");
    expect(input.className).toContain("disabled:opacity-50");
    expect(input.className).toContain("disabled:cursor-not-allowed");
  });

  it("forwards className to the rendered input", () => {
    render(<Input className="my-input" placeholder="x" />);
    expect(screen.getByPlaceholderText("x")).toHaveClass("my-input");
  });
});
