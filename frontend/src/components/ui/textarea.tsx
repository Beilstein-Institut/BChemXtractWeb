import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Textarea — form tier (Phase 3 Liquid Glass rebuild, Task 4).
 *
 * Shares the form-input pattern with Input and Select trigger:
 *   bg-surface-muted / border-border / rounded-sm / focus-visible ring-ring.
 *
 * Adds `min-h-20` + `resize-y` so long-form text still has a reasonable
 * default height and the user can drag-resize vertically.
 *
 * `data-slot="textarea"` is the stable hook for downstream selectors and
 * tests; do not rename.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full resize-y rounded-sm border border-border bg-surface-muted px-3 py-2 text-sm text-foreground transition-colors outline-none placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
