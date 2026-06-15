/**
 * Label — tests for the Liquid Glass form primitive.
 *
 * Covers: render, data-slot contract, htmlFor association with an input,
 * className forwarding, and the core base classes
 * (`text-sm font-medium mb-2 block`).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Label } from "@/components/ui/label";

describe("Label", () => {
  it("renders children", () => {
    render(<Label>Email</Label>);
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it('exposes data-slot="label"', () => {
    const { container } = render(<Label>x</Label>);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute("data-slot")).toBe("label");
  });

  it("forwards htmlFor and associates with a matching input", () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <input id="email" />
      </>,
    );
    const label = screen.getByText("Email") as HTMLLabelElement;
    expect(label.htmlFor).toBe("email");
    // getByLabelText uses the for/id association; if the association is
    // broken it throws.
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("applies the plan-specified base classes", () => {
    const { container } = render(<Label>x</Label>);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("text-sm");
    expect(root.className).toContain("font-medium");
    expect(root.className).toContain("mb-2");
    expect(root.className).toContain("block");
  });

  it("preserves peer-disabled opacity modifier", () => {
    const { container } = render(<Label>x</Label>);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("peer-disabled:opacity-50");
  });

  it("forwards className to the rendered element", () => {
    const { container } = render(<Label className="my-label">x</Label>);
    expect(container.firstChild).toHaveClass("my-label");
  });
});
