/**
 * Progress — tests for the Liquid Glass state primitive.
 *
 * Covers: render, data-slot on Root + Track + Indicator + Label + Value,
 * aria-valuenow reflection, inline-width on the indicator (Base UI
 * generates `width: 50%` via its render helper when value=50), and
 * core styling (bg-surface-muted track, bg-primary indicator,
 * transition-[width]).
 *
 * Base UI Progress sets width on the indicator via inline style from
 * the Root's `value` prop — NOT via a data-attr. See
 * `ProgressIndicator.js` in @base-ui/react.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";

describe("Progress", () => {
  it("renders a progressbar role element", () => {
    render(<Progress value={50} aria-label="loading" />);
    expect(screen.getByRole("progressbar", { name: "loading" })).toBeInTheDocument();
  });

  it('exposes data-slot="progress" on the root', () => {
    render(<Progress value={50} aria-label="p" />);
    const root = screen.getByRole("progressbar", { name: "p" });
    expect(root.getAttribute("data-slot")).toBe("progress");
  });

  it('exposes data-slot="progress-track" on the track', () => {
    const { container } = render(<Progress value={50} aria-label="p" />);
    expect(container.querySelector('[data-slot="progress-track"]')).not.toBeNull();
  });

  it('exposes data-slot="progress-indicator" on the indicator', () => {
    const { container } = render(<Progress value={50} aria-label="p" />);
    expect(container.querySelector('[data-slot="progress-indicator"]')).not.toBeNull();
  });

  it("reflects value via aria-valuenow", () => {
    render(<Progress value={42} aria-label="p" />);
    const root = screen.getByRole("progressbar", { name: "p" });
    expect(root.getAttribute("aria-valuenow")).toBe("42");
  });

  it("sets the indicator width to match the progress value", () => {
    const { container } = render(<Progress value={50} aria-label="p" />);
    const indicator = container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    expect(indicator.style.width).toBe("50%");
  });

  it("sets indicator width to 100% when value is 100", () => {
    const { container } = render(<Progress value={100} aria-label="p" />);
    const indicator = container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    expect(indicator.style.width).toBe("100%");
  });

  it("sets indicator width to 0% when value is 0", () => {
    const { container } = render(<Progress value={0} aria-label="p" />);
    const indicator = container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    expect(indicator.style.width).toBe("0%");
  });

  it("applies the plan-specified track classes", () => {
    const { container } = render(<Progress value={50} aria-label="p" />);
    const track = container.querySelector('[data-slot="progress-track"]') as HTMLElement;
    expect(track.className).toContain("bg-surface-muted");
    expect(track.className).toContain("rounded-full");
    // Thicker track (h-3) with a ring border for definition.
    expect(track.className).toContain("h-3");
    expect(track.className).toContain("ring-1");
    expect(track.className).toContain("ring-border");
  });

  it("applies the shimmer animation overlay on the indicator", () => {
    const { container } = render(<Progress value={50} aria-label="p" />);
    const indicator = container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    // Pseudo-element shimmer keyed off the batch-shimmer
    // keyframe declared in src/index.css.
    expect(indicator.className).toContain("after:animate-[batch-shimmer");
    expect(indicator.className).toContain("after:bg-gradient-to-r");
  });

  it("applies the plan-specified indicator classes", () => {
    const { container } = render(<Progress value={50} aria-label="p" />);
    const indicator = container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    expect(indicator.className).toContain("bg-primary");
    expect(indicator.className).toContain("transition-[width]");
  });

  it("renders ProgressLabel and ProgressValue children with correct data-slots", () => {
    const { container } = render(
      <Progress value={50} aria-label="p">
        <ProgressLabel>Loading</ProgressLabel>
        <ProgressValue>{(v) => `${v}%`}</ProgressValue>
      </Progress>,
    );
    expect(container.querySelector('[data-slot="progress-label"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="progress-value"]')).not.toBeNull();
  });
});
