import { describe, it, expect } from "vitest";
import { parseCdxTransform, cdxRectToSvg } from "./cdxTransform";

describe("cdxTransform", () => {
  it("parses transform attrs from the svg root", () => {
    const svg =
      '<svg data-cdx-scale="3" data-cdx-origin-x="0" data-cdx-origin-y="0" viewBox="0 0 10 10"></svg>';
    expect(parseCdxTransform(svg)).toEqual({ scale: 3, originX: 0, originY: 0 });
  });

  it("returns null when attrs are missing", () => {
    expect(parseCdxTransform("<svg></svg>")).toBeNull();
  });

  it("maps a CDX rect to SVG space", () => {
    const t = { scale: 3, originX: 0, originY: 0 };
    expect(cdxRectToSvg({ l: 10, t: 20, r: 30, b: 50 }, t)).toEqual({
      x: 30,
      y: 60,
      width: 60,
      height: 90,
    });
  });

  it("parses a signed exponent in a stamped attr value (Java Double.toString output)", () => {
    const svg =
      '<svg data-cdx-scale="1.0" data-cdx-origin-x="1.5E-3" data-cdx-origin-y="0.0" viewBox="0 0 10 10"></svg>';
    const t = parseCdxTransform(svg);
    expect(t).not.toBeNull();
    expect(t!.originX).toBeCloseTo(0.0015);
  });
});
