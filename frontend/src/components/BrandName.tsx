import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface BrandNameProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * When true, append " Web" in medium weight after the core wordmark.
   * Used for "BChemXtractWeb" branding on the Extract hero / About prose.
   */
  suffix?: "Web" | null;
}

/**
 * BrandName — canonical wordmark for "BChemXtract" (and "BChemXtractWeb").
 *
 * Rendered in Clan Pro Medium with "BC" and "X" bolded, and "X" tinted the
 * crimson brand primary (oklch equivalent of #C71354). Falls back to the
 * display font stack when Clan Pro is unavailable.
 *
 * The four fragments stay inside one <span> so `element.textContent`
 * round-trips cleanly — Testing Library's text-matcher + screen-readers
 * both see the single logical word.
 */
export function BrandName({ suffix = null, className, ...rest }: BrandNameProps) {
  return (
    <span
      data-slot="brand-name"
      className={cn("font-brand font-medium tracking-tight", className)}
      {...rest}
    >
      <span className="font-bold">BC</span>
      <span>hem</span>
      <span className="font-bold text-primary">X</span>
      <span>tract</span>
      {suffix === "Web" && <span>Web</span>}
    </span>
  );
}
