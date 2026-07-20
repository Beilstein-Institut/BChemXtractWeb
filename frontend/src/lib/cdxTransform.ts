import type { Rect } from "@/types/chemistry";

export interface CdxTransform {
  scale: number;
  originX: number;
  originY: number;
}

/** Parse the CDX→SVG transform stamped on the render root by the backend. */
export function parseCdxTransform(svg: string): CdxTransform | null {
  const num = (attr: string): number | null => {
    // Stamped values are raw Java `Double.toString` output, which for
    // extreme magnitudes can include a signed exponent (e.g. "1.0E-5",
    // "1.0E+5"). Include "+" in the char class so those still match —
    // `Number(...)` parses the matched string correctly either way.
    const m = svg.match(new RegExp(`data-cdx-${attr}="([-+\\d.eE]+)"`));
    return m ? Number(m[1]) : null;
  };
  const scale = num("scale");
  const originX = num("origin-x");
  const originY = num("origin-y");
  if (scale == null || originX == null || originY == null) return null;
  return { scale, originX, originY };
}

/** Map a CDX-space rect to the SVG user-space of the faithful render. */
export function cdxRectToSvg(rect: Rect, t: CdxTransform) {
  return {
    x: (rect.l - t.originX) * t.scale,
    y: (rect.t - t.originY) * t.scale,
    width: (rect.r - rect.l) * t.scale,
    height: (rect.b - rect.t) * t.scale,
  };
}
