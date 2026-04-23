/**
 * Button — tests for the Phase 3 Liquid Glass surface primitive (Task 3).
 *
 * Covers: render, data-slot + data-variant contract, click handler,
 * disabled behavior (no click fires), focus-visible ring class,
 * variant class resolution, and size class resolution.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(
      screen.getByRole("button", { name: "Click me" })
    ).toBeInTheDocument();
  });

  it("exposes data-slot=\"button\"", () => {
    render(<Button>x</Button>);
    expect(screen.getByRole("button").getAttribute("data-slot")).toBe("button");
  });

  it("reflects the selected variant via data-variant", () => {
    render(<Button variant="secondary">x</Button>);
    expect(screen.getByRole("button").getAttribute("data-variant")).toBe(
      "secondary"
    );
  });

  it("defaults variant to \"default\"", () => {
    render(<Button>x</Button>);
    expect(screen.getByRole("button").getAttribute("data-variant")).toBe(
      "default"
    );
  });

  it("fires onClick when clicked", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Hit</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Hit" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Nope
      </Button>
    );
    fireEvent.click(screen.getByRole("button", { name: "Nope" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies disabled style classes when disabled", () => {
    render(<Button disabled>x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("disabled:opacity-50");
    expect(btn.className).toContain("disabled:pointer-events-none");
  });

  it("applies focus-visible ring class", () => {
    render(<Button>x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("focus-visible:ring-2");
    expect(btn.className).toContain("focus-visible:ring-ring");
  });

  it("resolves primary variant to the shiny primary utility", () => {
    render(<Button variant="primary">x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-shiny");
    expect(btn.className).toContain("btn-shiny-primary");
  });

  it("resolves default variant to the shiny primary utility (alias)", () => {
    render(<Button>x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-shiny-primary");
  });

  it("resolves secondary variant to the shiny secondary utility", () => {
    render(<Button variant="secondary">x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-shiny-secondary");
  });

  it("resolves outline variant to the shiny outline utility", () => {
    render(<Button variant="outline">x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-shiny-outline");
  });

  it("resolves ghost variant to the shiny ghost utility", () => {
    render(<Button variant="ghost">x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-shiny-ghost");
  });

  it("resolves destructive variant to the shiny destructive utility", () => {
    render(<Button variant="destructive">x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-shiny-destructive");
  });

  it("applies the lg size height", () => {
    render(<Button size="lg">x</Button>);
    expect(screen.getByRole("button").className).toContain("h-12");
  });

  it("applies the sm size height", () => {
    render(<Button size="sm">x</Button>);
    expect(screen.getByRole("button").className).toContain("h-8");
  });

  it("applies the default size height", () => {
    render(<Button>x</Button>);
    expect(screen.getByRole("button").className).toContain("h-10");
  });

  it("applies the icon size as square 10", () => {
    render(<Button size="icon">x</Button>);
    expect(screen.getByRole("button").className).toContain("size-10");
  });

  it("forwards className into the generated class string", () => {
    render(<Button className="my-btn">x</Button>);
    expect(screen.getByRole("button").className).toContain("my-btn");
  });
});
