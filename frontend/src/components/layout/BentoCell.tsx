import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { parseSpan, SPAN_CLASSES } from "./bentoSpan";

/**
 * BentoCell — Phase 3 Liquid Glass rebuild (Task 8).
 *
 * Single cell in a {@link BentoGrid}. Its `span` prop uses the
 * `"colSpan:rowSpan"` shorthand (e.g. `"2:1"` for a 2x1 wide tile,
 * `"1:2"` for a tall tile). Defaults to `"1:1"`.
 *
 * Responsive contract (matches BentoGrid):
 *   - base/md: every cell is forced to `col-span-1 row-span-1` (single
 *     column at base, 2 cols at md — spans are ignored so cells stack
 *     predictably on smaller viewports).
 *   - lg+: the requested span is applied via a literal lookup class
 *     from {@link SPAN_CLASSES}.
 *
 * Span parsing + the lookup table live in `./bentoSpan.ts` so this
 * file only exports components (complies with
 * `react-refresh/only-export-components`). Tests import `parseSpan`
 * directly from that module.
 *
 * The span classes are intentionally expressed as literal class strings
 * so Tailwind 4's JIT scanner captures them at build time — attempting
 * to do this with arbitrary utilities keyed on a CSS variable
 * (`lg:col-span-[var(--x)]`) is brittle in Tailwind 4 when the runtime
 * value changes per instance.
 *
 * Exposes `data-slot="bento-cell"` and `data-span={span}` for tests /
 * selectors.
 */
interface BentoCellProps extends HTMLAttributes<HTMLDivElement> {
  /** Span shorthand `"colSpan:rowSpan"`. Defaults to `"1:1"`. */
  span?: string;
  children?: ReactNode;
}

export function BentoCell({ span, className, children, ...rest }: BentoCellProps) {
  const resolvedSpan = span ?? "1:1";
  const { colSpan, rowSpan } = parseSpan(resolvedSpan);
  // Clamp to the lookup's supported range so an unusual span ("5:1", "0:0")
  // still yields a valid class string. If the caller passes a span outside
  // the table, we compose the closest class from clamped numbers.
  const lookupKey = `${Math.min(colSpan, 4)}:${Math.min(rowSpan, 4)}`;
  const spanClasses = SPAN_CLASSES[lookupKey] ?? SPAN_CLASSES["1:1"];

  return (
    <div
      data-slot="bento-cell"
      data-span={resolvedSpan}
      className={cn(
        // Base / md: always 1x1 regardless of the requested span.
        "col-span-1 row-span-1",
        // Desktop lg+: apply the requested span via the lookup.
        spanClasses,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
