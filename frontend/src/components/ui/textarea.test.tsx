/**
 * Textarea — tests for the Phase 3 Liquid Glass form primitive (Task 4).
 *
 * Covers: render, data-slot contract, controlled value/onChange, disabled
 * surfacing, rows/cols forwarding, focus-visible ring class, and core
 * form-tier styling (`bg-surface-muted`, `border-border`, `rounded-sm`,
 * `min-h-*`, `resize-y`).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Textarea } from "@/components/ui/textarea";

describe("Textarea", () => {
  it("renders a textarea element", () => {
    render(<Textarea placeholder="notes" />);
    expect(screen.getByPlaceholderText("notes")).toBeInTheDocument();
  });

  it("exposes data-slot=\"textarea\"", () => {
    render(<Textarea placeholder="x" />);
    const textarea = screen.getByPlaceholderText("x");
    expect(textarea.getAttribute("data-slot")).toBe("textarea");
  });

  it("forwards value and fires onChange", () => {
    const onChange = vi.fn();
    render(
      <Textarea value="hello" onChange={onChange} placeholder="x" />
    );
    const textarea = screen.getByPlaceholderText("x") as HTMLTextAreaElement;
    expect(textarea.value).toBe("hello");
    fireEvent.change(textarea, { target: { value: "hello world" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("surfaces disabled on the DOM element", () => {
    render(<Textarea disabled placeholder="x" />);
    const textarea = screen.getByPlaceholderText("x") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
  });

  it("forwards rows and cols attributes", () => {
    render(<Textarea rows={7} cols={42} placeholder="x" />);
    const textarea = screen.getByPlaceholderText("x") as HTMLTextAreaElement;
    expect(textarea.rows).toBe(7);
    expect(textarea.cols).toBe(42);
  });

  it("applies focus-visible ring classes", () => {
    render(<Textarea placeholder="x" />);
    const textarea = screen.getByPlaceholderText("x");
    expect(textarea.className).toContain("focus-visible:ring-2");
    expect(textarea.className).toContain("focus-visible:ring-ring");
  });

  it("applies the form-tier surface classes", () => {
    render(<Textarea placeholder="x" />);
    const textarea = screen.getByPlaceholderText("x");
    expect(textarea.className).toContain("bg-surface-muted");
    expect(textarea.className).toContain("border-border");
    expect(textarea.className).toContain("rounded-sm");
  });

  it("applies resize + min-height hints", () => {
    render(<Textarea placeholder="x" />);
    const textarea = screen.getByPlaceholderText("x");
    expect(textarea.className).toContain("resize-y");
    expect(textarea.className).toContain("min-h-20");
  });

  it("forwards className to the rendered textarea", () => {
    render(<Textarea className="my-area" placeholder="x" />);
    expect(screen.getByPlaceholderText("x")).toHaveClass("my-area");
  });
});
