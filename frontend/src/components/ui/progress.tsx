"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";

import { cn } from "@/lib/utils";

/**
 * Progress — state tier (Phase 3 Liquid Glass rebuild, Task 5; Task 22
 * thickens the track, adds a ring border, and layers a shimmer on the
 * indicator so an in-flight batch is always legible).
 *
 * Wraps Base UI's Progress.Root + Track + Indicator. The Root is a
 * flex layout so `ProgressLabel` + `ProgressValue` (when passed as
 * children) sit above the track. Track: `h-3 rounded-full
 * bg-surface-muted ring-1 ring-border` for a defined edge. Indicator:
 * crimson `bg-primary` with a transitioned width driven by Base UI's
 * inline `style` output, plus an `::after` shimmer stripe that loops
 * the `batch-shimmer` keyframe (see `src/index.css`). The shimmer
 * only sweeps while there is visible indicator area and is flattened
 * under `prefers-reduced-motion`.
 */
function Progress({ className, children, value, ...props }: ProgressPrimitive.Root.Props) {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn("flex flex-wrap gap-2", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  );
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      data-slot="progress-track"
      className={cn(
        "relative h-3 w-full overflow-hidden rounded-full bg-surface-muted ring-1 ring-border",
        className,
      )}
      {...props}
    />
  );
}

function ProgressIndicator({ className, ...props }: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn(
        "relative h-full overflow-hidden bg-primary transition-[width] duration-300 ease-out",
        // Shimmer stripe — a moving highlight overlayed on the crimson
        // fill to signal activity even when the bar width is static
        // between chunks. The keyframe is declared in src/index.css
        // so the reduced-motion override lives there too.
        "after:content-[''] after:absolute after:inset-y-0 after:left-0 after:w-1/2",
        "after:bg-gradient-to-r after:from-transparent after:via-white/40 after:to-transparent",
        "after:animate-[batch-shimmer_1.6s_ease-in-out_infinite]",
        className,
      )}
      {...props}
    />
  );
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label
      data-slot="progress-label"
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      data-slot="progress-value"
      className={cn("ml-auto text-sm tabular-nums text-foreground-muted", className)}
      {...props}
    />
  );
}

export { Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue };
