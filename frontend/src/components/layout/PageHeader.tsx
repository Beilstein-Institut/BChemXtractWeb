import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Page title, rendered as the route's single <h1>. */
  title: ReactNode;
  /** Short lede paragraph under the title. */
  lede?: ReactNode;
  /** Small label rendered above the title (the legal pages' pill). */
  eyebrow?: ReactNode;
  /** Controls aligned to the right of the title block (e.g. view toggles). */
  actions?: ReactNode;
  /** Extra content under the lede (e.g. a privacy notice). */
  children?: ReactNode;
  /** Extra classes for the <header> (e.g. `mb-0` when a sibling sits beside it). */
  className?: string;
}

/**
 * Title block shared by every inner route, so title size, lede width and the
 * gap before the page body are identical everywhere. The home landing keeps
 * its own centered hero and does not use this.
 */
export function PageHeader({
  title,
  lede,
  eyebrow,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn("mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}
    >
      <div className="min-w-0 space-y-3">
        {eyebrow}
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {title}
        </h1>
        {lede ? <p className="max-w-[60ch] text-base text-foreground-muted">{lede}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
