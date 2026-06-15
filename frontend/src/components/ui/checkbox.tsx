"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Checkbox — state tier (Liquid Glass rebuild).
 *
 * Square box: `size-4 rounded-sm border border-border bg-surface-muted`
 * off; fills with `bg-primary` + `border-primary` when checked
 * (Base UI `data-checked`). Indicator is a lucide CheckIcon revealed when
 * checked. `data-slot` hooks are preserved for glass selectors.
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative inline-flex size-4 shrink-0 items-center justify-center",
        "rounded-sm border border-border bg-surface-muted",
        "transition-colors duration-150 outline-none",
        // Focus ring
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        // Checked state
        "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
        // Disabled
        "disabled:cursor-not-allowed disabled:opacity-50 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        // Invalid (field context)
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
      >
        <CheckIcon className="size-3 text-primary-foreground" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
