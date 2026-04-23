/**
 * Button — tests for the Phase 3 Liquid Glass surface primitive.
 *
 * Covers: render, data-slot + data-variant contract, click handler,
 * disabled behavior (no click fires), focus-visible ring class,
 * variant class resolution (claymorphism utilities), size class
 * resolution, and the optional `icon` prop's circular sub-wrapper.
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

  it("resolves primary variant to the clay primary utility", () => {
    render(<Button variant="primary">x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-clay");
    expect(btn.className).toContain("btn-clay-primary");
  });

  it("resolves default variant to the clay primary utility (alias)", () => {
    render(<Button>x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-clay-primary");
  });

  it("resolves secondary variant to the clay secondary utility", () => {
    render(<Button variant="secondary">x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-clay-secondary");
  });

  it("resolves outline variant to the clay outline utility", () => {
    render(<Button variant="outline">x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-clay-outline");
  });

  it("resolves ghost variant to the clay ghost utility", () => {
    render(<Button variant="ghost">x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-clay-ghost");
  });

  it("resolves destructive variant to the clay destructive utility", () => {
    render(<Button variant="destructive">x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-clay-destructive");
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

  it("applies rounded-xl at default size for the chunky clay silhouette", () => {
    render(<Button>x</Button>);
    expect(screen.getByRole("button").className).toContain("rounded-xl");
  });

  it("wraps the icon prop in a circular sub-wrapper (.btn-clay__icon)", () => {
    render(
      <Button icon={<svg data-testid="icon-svg" />}>Send</Button>
    );
    const btn = screen.getByRole("button", { name: "Send" });
    const iconWrapper = btn.querySelector(".btn-clay__icon");
    expect(iconWrapper).not.toBeNull();
    expect(iconWrapper?.getAttribute("aria-hidden")).toBe("true");
    // The icon is rendered inside the wrapper.
    expect(iconWrapper?.querySelector('[data-testid="icon-svg"]')).not.toBeNull();
  });

  it("omits the icon sub-wrapper when no icon prop is passed", () => {
    render(<Button>Plain</Button>);
    const btn = screen.getByRole("button", { name: "Plain" });
    expect(btn.querySelector(".btn-clay__icon")).toBeNull();
  });
});
