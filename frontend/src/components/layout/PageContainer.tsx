import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * PageContainer — Liquid Glass rebuild.
 *
 * Centered max-width wrapper with the page-level padding used by every
 * route (Extract, Browse, History, About). Layers compose on top:
 * the sticky `AppHeader` sits above it, and page-specific content
 * (BentoGrid, WizardStepper, tables, ...) lives inside.
 *
 * Default width is `max-w-7xl` and default padding is `px-6 py-8`; both
 * can be overridden by appending utilities via `className` — Tailwind
 * merge guarantees the caller's classes win.
 *
 * Exposes `data-slot="page-container"` so downstream selectors or tests
 * can query the page shell without depending on class names.
 */
export function PageContainer({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <div
      data-slot="page-container"
      className={cn("mx-auto w-full max-w-7xl px-6 py-8", className)}
      {...rest}
    >
      {children}
    </div>
  );
}
