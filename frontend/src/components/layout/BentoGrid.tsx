import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * BentoGrid — Phase 3 Liquid Glass rebuild (Task 8).
 *
 * Responsive CSS-grid container for the bento composition idiom used by
 * Tasks 11–13 (Browse, History, About). Breakpoints:
 *
 *   - base (<md): single column, every cell stacks
 *   - md:         capped at 2 columns (tablet)
 *   - lg:+        N columns driven by `cols` (default 4)
 *
 * The `lg:` column count is delivered via the `--bento-cols` CSS custom
 * property plus a `lg:grid-cols-[repeat(var(--bento-cols),minmax(0,1fr))]`
 * arbitrary Tailwind utility. That combination is safe in Tailwind 4
 * because the utility is a literal string that JIT scans; only the
 * variable's value changes per instance, not the class name.
 *
 * `data-slot="bento-grid"` and `data-cols={cols}` expose hooks for CSS
 * selectors, tests, and debugging.
 */
interface BentoGridProps extends HTMLAttributes<HTMLDivElement> {
  /** Number of columns at `lg:` and above. Default 4. */
  cols?: number;
  children?: ReactNode;
}

export function BentoGrid({ cols = 4, className, style, children, ...rest }: BentoGridProps) {
  const mergedStyle = {
    ...(style ?? {}),
    ["--bento-cols" as unknown as keyof CSSProperties]: String(cols),
  } as CSSProperties;

  return (
    <div
      data-slot="bento-grid"
      data-cols={cols}
      className={cn(
        "grid gap-4",
        // Mobile (<md): single column, ignore cell spans.
        "grid-cols-1",
        // Tablet md: cap at two columns.
        "md:grid-cols-2",
        // Desktop lg+: use the `--bento-cols` variable to build N columns.
        "lg:grid-cols-[repeat(var(--bento-cols),minmax(0,1fr))]",
        className,
      )}
      style={mergedStyle}
      {...rest}
    >
      {children}
    </div>
  );
}
