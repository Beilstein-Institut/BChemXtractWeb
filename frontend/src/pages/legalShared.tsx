/**
 * Shared pieces for the three legal pages (Terms / Imprint / Privacy).
 *
 * These three routes share the same editorial chrome — a small uppercase
 * eyebrow badge above the title, a large heading, and a lede paragraph —
 * plus an identical utility class string for primary underlined inline
 * links. Keeping them here avoids drift (e.g. one page's eyebrow losing
 * its icon padding during a future token pass) and halves the touch
 * surface for copy tweaks.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Primary inline-link style used across legal pages — tinted crimson
 * with a low-contrast underline that firms up on hover. The `/40` in
 * `decoration-primary/40` is the opacity modifier so the underline
 * reads as a hint until pointer interaction.
 */
export const LEGAL_LINK_CLASS =
  "text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary";

interface LegalPageHeaderProps {
  /** Small icon rendered inside the eyebrow pill (defaults to none). */
  icon?: ReactNode;
  /** Eyebrow label — rendered uppercase. */
  eyebrow: string;
  /** Page title. */
  title: string;
  /** Short lede paragraph immediately below the title. */
  lede: ReactNode;
  className?: string;
}

/**
 * Header block used by every legal page. The eyebrow uses the same
 * surface-elevated pill treatment as the About page's section tags.
 */
export function LegalPageHeader({ icon, eyebrow, title, lede, className }: LegalPageHeaderProps) {
  return (
    <header className={cn("space-y-3", className)}>
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-elevated px-3 py-1 text-caption uppercase tracking-wider text-foreground-muted">
        {icon}
        <span>{eyebrow}</span>
      </div>
      <h1 className="text-4xl text-foreground sm:text-5xl">{title}</h1>
      <p className="max-w-[70ch] text-base text-foreground-muted">{lede}</p>
    </header>
  );
}
