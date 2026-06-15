/**
 * Badge — tests for the Liquid Glass chip primitive.
 *
 * Covers: render, data-slot + data-variant contract, className forwarding,
 * variant class resolution for each of the five supported variants.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>new</Badge>);
    expect(screen.getByText("new")).toBeInTheDocument();
  });

  it('exposes data-slot="badge"', () => {
    const { container } = render(<Badge>x</Badge>);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute("data-slot")).toBe("badge");
  });

  it('defaults to variant="default"', () => {
    const { container } = render(<Badge>x</Badge>);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute("data-variant")).toBe("default");
    expect(root.className).toContain("bg-primary");
  });

  it("resolves secondary variant", () => {
    const { container } = render(<Badge variant="secondary">x</Badge>);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute("data-variant")).toBe("secondary");
    expect(root.className).toContain("bg-secondary");
  });

  it("resolves outline variant", () => {
    const { container } = render(<Badge variant="outline">x</Badge>);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute("data-variant")).toBe("outline");
    expect(root.className).toContain("border-border");
    expect(root.className).toContain("bg-transparent");
  });

  it("resolves success variant", () => {
    const { container } = render(<Badge variant="success">ok</Badge>);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute("data-variant")).toBe("success");
    // Arbitrary value — verify the success tint token slipped through.
    expect(root.className).toMatch(/155\)/);
  });

  it("resolves warning variant", () => {
    const { container } = render(<Badge variant="warning">heads up</Badge>);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute("data-variant")).toBe("warning");
    // Arbitrary value — verify the warning tint token slipped through.
    expect(root.className).toMatch(/7[05]\)/);
  });

  it("applies focus-visible ring classes", () => {
    const { container } = render(<Badge>x</Badge>);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("focus-visible:ring-2");
    expect(root.className).toContain("focus-visible:ring-ring");
  });

  it("forwards className to the rendered element", () => {
    const { container } = render(<Badge className="my-badge">x</Badge>);
    expect(container.firstChild).toHaveClass("my-badge");
  });
});
