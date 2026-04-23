import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";

import { cn } from "@/lib/utils";

/**
 * RadioGroup — state tier (Phase 3 Liquid Glass rebuild, Task 5).
 *
 * Group lays children out in a vertical stack by default. Item is a
 * round `size-4` button with `border-border bg-surface-muted` that
 * flips its border to `border-primary` when selected (Base UI
 * `data-checked`). Indicator is an inner `size-2` dot in
 * `bg-primary-foreground`. `data-slot` hooks are preserved for Task 6
 * glass selectors.
 */
function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  );
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "group/radio-group-item peer relative inline-flex aspect-square size-4 shrink-0 items-center justify-center",
        "rounded-full border border-border bg-surface-muted",
        "transition-colors duration-150 outline-none",
        // Focus ring
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        // Checked state: crimson border + crimson fill
        "data-checked:border-primary data-checked:bg-primary",
        // Disabled
        "disabled:cursor-not-allowed disabled:opacity-50 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        // Invalid
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex items-center justify-center"
      >
        <span className="size-2 rounded-full bg-primary-foreground" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, RadioGroupItem };
