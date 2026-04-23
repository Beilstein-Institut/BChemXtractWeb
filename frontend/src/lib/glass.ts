/**
 * Liquid Glass surface utilities (Phase 3, Task 6).
 *
 * Single source of truth for the Tailwind class cluster that skins every
 * floating primitive (Dialog, Popover, Tooltip, DropdownMenu, Sheet, Drawer,
 * HoverCard, Menubar, ContextMenu, NavigationMenu, Command, and the Select
 * popup) with the `--glass-*` tokens from `styles/tokens.css`.
 *
 * The token layer already routes `prefers-reduced-transparency` to a flat
 * surface — no per-component opt-out is needed. Dark-mode tinting is handled
 * by swapping `--glass-tint-light` for `--glass-tint-dark` via the `dark:`
 * variant in the class string below.
 *
 * Usage:
 * ```tsx
 * <Content className={cn(glassSurfaceClasses, "rounded-lg p-4", className)} />
 * ```
 */
export const glassSurfaceClasses = [
  "bg-[var(--glass-tint-light)] dark:bg-[var(--glass-tint-dark)]",
  "backdrop-blur-[var(--glass-blur)] backdrop-saturate-[var(--glass-saturate)]",
  "border border-[var(--glass-border)]",
  "shadow-lg",
].join(" ");

/**
 * Overlay/backdrop class cluster — token-driven dim layer for modal surfaces
 * (Dialog, AlertDialog, Sheet, Drawer). Uses the foreground token at 30%
 * alpha so the dim inherits the palette hue (warm-navy in light, near-white
 * in dark) instead of a hard `black/50`.
 */
export const glassOverlayClasses = "bg-foreground/30 supports-backdrop-filter:backdrop-blur-sm";
