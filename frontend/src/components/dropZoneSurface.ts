import type { CSSProperties } from "react";

/**
 * Shared look for the Extract and View drop zones so both pages present the
 * same upload surface: dashed border, recessed neumorphic fill, the faint
 * molecular-paper dot pattern, and one empty-state height.
 */
export const DROP_ZONE_SURFACE_CLASS =
  "rounded-xl border-2 border-dashed bg-surface-elevated border-border shadow-[var(--shadow-neu-inset)]";

/** Empty-state height: compact on phones, fixed at sm+ so the page fits one screen. */
export const DROP_ZONE_EMPTY_HEIGHT_CLASS = "min-h-[200px] sm:min-h-[280px]";

export const DROP_ZONE_SURFACE_STYLE: CSSProperties = {
  // Faint molecular-paper dot pattern, primary-hue tinted at ~7%.
  backgroundImage:
    "radial-gradient(circle at center, color-mix(in oklch, var(--color-primary) 7%, transparent) 1px, transparent 1.2px)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0",
  // Background-color, border-color, and shadow transition together; layout
  // properties (min-height) intentionally do not. Reduced motion zeroes
  // --motion-medium via tokens.css.
  transitionProperty: "background-color, border-color, box-shadow",
  transitionDuration: "var(--motion-medium)",
  transitionTimingFunction: "var(--ease-out)",
};
