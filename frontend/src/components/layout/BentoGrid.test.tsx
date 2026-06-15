/**
 * Tests for BentoGrid + BentoCell.
 *
 * Covers:
 *   - parseSpan pure-function behavior (happy path + graceful fallback)
 *   - BentoGrid data-slot / data-cols / CSS var + responsive classes
 *   - BentoCell data-slot / data-span + span-class lookup
 *
 * Vitest globals enabled; describe/it/expect implicit.
 */
import { render, screen } from "@testing-library/react";

import { BentoGrid } from "./BentoGrid";
import { BentoCell } from "./BentoCell";
import { parseSpan } from "./bentoSpan";

describe("parseSpan", () => {
  it("returns {1, 1} for undefined input", () => {
    expect(parseSpan(undefined)).toEqual({ colSpan: 1, rowSpan: 1 });
  });

  it("parses a valid span", () => {
    expect(parseSpan("2:3")).toEqual({ colSpan: 2, rowSpan: 3 });
  });

  it("parses 1:1", () => {
    expect(parseSpan("1:1")).toEqual({ colSpan: 1, rowSpan: 1 });
  });

  it("gracefully handles malformed input", () => {
    expect(parseSpan("foo")).toEqual({ colSpan: 1, rowSpan: 1 });
    expect(parseSpan("")).toEqual({ colSpan: 1, rowSpan: 1 });
    expect(parseSpan(":")).toEqual({ colSpan: 1, rowSpan: 1 });
    expect(parseSpan("2:")).toEqual({ colSpan: 2, rowSpan: 1 });
  });

  it("clamps zero / negative components up to 1", () => {
    expect(parseSpan("0:0")).toEqual({ colSpan: 1, rowSpan: 1 });
    expect(parseSpan("-1:-1")).toEqual({ colSpan: 1, rowSpan: 1 });
  });
});

describe("BentoGrid", () => {
  it("emits data-slot='bento-grid' and data-cols with the --bento-cols var", () => {
    render(
      <BentoGrid data-testid="grid" cols={4}>
        <div />
      </BentoGrid>,
    );
    const grid = screen.getByTestId("grid");
    expect(grid.dataset.slot).toBe("bento-grid");
    expect(grid.dataset.cols).toBe("4");
    // CSS var delivers the column count to the `lg:` repeat() utility.
    expect(grid.style.getPropertyValue("--bento-cols")).toBe("4");
  });

  it("defaults to cols=4 when the prop is omitted", () => {
    render(
      <BentoGrid data-testid="grid">
        <div />
      </BentoGrid>,
    );
    const grid = screen.getByTestId("grid");
    expect(grid.dataset.cols).toBe("4");
    expect(grid.style.getPropertyValue("--bento-cols")).toBe("4");
  });

  it("reads the cols prop for non-default column counts", () => {
    render(
      <BentoGrid data-testid="grid" cols={6}>
        <div />
      </BentoGrid>,
    );
    const grid = screen.getByTestId("grid");
    expect(grid.dataset.cols).toBe("6");
    expect(grid.style.getPropertyValue("--bento-cols")).toBe("6");
  });

  it("applies responsive breakpoint classes", () => {
    render(
      <BentoGrid data-testid="grid" cols={4}>
        <div />
      </BentoGrid>,
    );
    const grid = screen.getByTestId("grid");
    expect(grid.className).toMatch(/grid-cols-1\b/);
    expect(grid.className).toMatch(/md:grid-cols-2\b/);
    expect(grid.className).toMatch(/lg:grid-cols-\[repeat\(var\(--bento-cols/);
  });

  it("renders its children", () => {
    render(
      <BentoGrid cols={2}>
        <div data-testid="child-a" />
        <div data-testid="child-b" />
      </BentoGrid>,
    );
    expect(screen.getByTestId("child-a")).toBeInTheDocument();
    expect(screen.getByTestId("child-b")).toBeInTheDocument();
  });
});

describe("BentoCell", () => {
  it("emits data-slot='bento-cell' and data-span='1:1' by default", () => {
    render(
      <BentoCell data-testid="cell">
        <span>x</span>
      </BentoCell>,
    );
    const cell = screen.getByTestId("cell");
    expect(cell.dataset.slot).toBe("bento-cell");
    expect(cell.dataset.span).toBe("1:1");
  });

  it("applies the requested span via the literal class lookup", () => {
    render(
      <BentoCell data-testid="cell" span="2:1">
        <span />
      </BentoCell>,
    );
    const cell = screen.getByTestId("cell");
    expect(cell.dataset.span).toBe("2:1");
    expect(cell.className).toMatch(/lg:col-span-2\b/);
    expect(cell.className).toMatch(/lg:row-span-1\b/);
  });

  it("applies row-spans for tall tiles", () => {
    render(
      <BentoCell data-testid="cell" span="1:2">
        <span />
      </BentoCell>,
    );
    const cell = screen.getByTestId("cell");
    expect(cell.className).toMatch(/lg:col-span-1\b/);
    expect(cell.className).toMatch(/lg:row-span-2\b/);
  });

  it("applies the full 2:2 hero span", () => {
    render(
      <BentoCell data-testid="cell" span="2:2">
        <span />
      </BentoCell>,
    );
    const cell = screen.getByTestId("cell");
    expect(cell.className).toMatch(/lg:col-span-2\b/);
    expect(cell.className).toMatch(/lg:row-span-2\b/);
  });

  it("forces col-span-1 row-span-1 at base/md so cells stack", () => {
    render(
      <BentoCell data-testid="cell" span="2:2">
        <span />
      </BentoCell>,
    );
    const cell = screen.getByTestId("cell");
    expect(cell.className).toMatch(/\bcol-span-1\b/);
    expect(cell.className).toMatch(/\brow-span-1\b/);
  });

  it("clamps out-of-range spans to the 4x4 lookup ceiling", () => {
    render(
      <BentoCell data-testid="cell" span="9:9">
        <span />
      </BentoCell>,
    );
    const cell = screen.getByTestId("cell");
    // data-span preserves what the caller asked for; the class clamps.
    expect(cell.dataset.span).toBe("9:9");
    expect(cell.className).toMatch(/lg:col-span-4\b/);
    expect(cell.className).toMatch(/lg:row-span-4\b/);
  });

  it("falls back to 1:1 for malformed span strings", () => {
    render(
      <BentoCell data-testid="cell" span="foo">
        <span />
      </BentoCell>,
    );
    const cell = screen.getByTestId("cell");
    expect(cell.dataset.span).toBe("foo");
    expect(cell.className).toMatch(/lg:col-span-1\b/);
    expect(cell.className).toMatch(/lg:row-span-1\b/);
  });
});
