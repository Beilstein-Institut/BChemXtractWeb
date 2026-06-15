"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Label — form tier (Liquid Glass rebuild).
 *
 * Base classes: `text-sm font-medium mb-2 block`.
 *
 * The legacy peer-disabled / group-disabled selectors are preserved so
 * existing form layouts that nest this label next to a disabled input or
 * inside a `group[data-disabled=true]` wrapper keep their muted state.
 *
 * `data-slot="label"` is the stable hook for downstream selectors and
 * tests; do not rename.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "mb-2 block text-sm font-medium leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
