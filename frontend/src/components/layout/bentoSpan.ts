/**
 * `BentoCell` span parsing helpers.
 *
 * Kept in a standalone module so the `BentoCell.tsx` file only exports
 * components (matches the `react-refresh/only-export-components` rule).
 */

export interface ParsedSpan {
  colSpan: number;
  rowSpan: number;
}

/**
 * Parse a `"colSpan:rowSpan"` string into its numeric components.
 *
 * Graceful fallback: missing / malformed input resolves to `{1, 1}` so
 * `BentoCell` never crashes on a bad prop.
 */
export function parseSpan(span?: string): ParsedSpan {
  if (!span || typeof span !== "string") {
    return { colSpan: 1, rowSpan: 1 };
  }
  const [colStr, rowStr] = span.split(":");
  const colRaw = Number.parseInt(colStr ?? "", 10);
  const rowRaw = Number.parseInt(rowStr ?? "", 10);
  const colSpan = Number.isFinite(colRaw) && colRaw >= 1 ? colRaw : 1;
  const rowSpan = Number.isFinite(rowRaw) && rowRaw >= 1 ? rowRaw : 1;
  return { colSpan, rowSpan };
}

/**
 * Lookup table of supported span shapes → literal `lg:` Tailwind
 * classes. Kept as literal strings so Tailwind's JIT picks them up.
 * Covers 1x1 up through 4x4, which is the practical ceiling when the
 * grid is 4 columns wide (the default).
 */
export const SPAN_CLASSES: Record<string, string> = {
  "1:1": "lg:col-span-1 lg:row-span-1",
  "1:2": "lg:col-span-1 lg:row-span-2",
  "1:3": "lg:col-span-1 lg:row-span-3",
  "1:4": "lg:col-span-1 lg:row-span-4",
  "2:1": "lg:col-span-2 lg:row-span-1",
  "2:2": "lg:col-span-2 lg:row-span-2",
  "2:3": "lg:col-span-2 lg:row-span-3",
  "2:4": "lg:col-span-2 lg:row-span-4",
  "3:1": "lg:col-span-3 lg:row-span-1",
  "3:2": "lg:col-span-3 lg:row-span-2",
  "3:3": "lg:col-span-3 lg:row-span-3",
  "3:4": "lg:col-span-3 lg:row-span-4",
  "4:1": "lg:col-span-4 lg:row-span-1",
  "4:2": "lg:col-span-4 lg:row-span-2",
  "4:3": "lg:col-span-4 lg:row-span-3",
  "4:4": "lg:col-span-4 lg:row-span-4",
};
