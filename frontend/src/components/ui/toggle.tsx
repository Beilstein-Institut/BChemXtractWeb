"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Toggle — state tier (Phase 3 Liquid Glass rebuild, Task 5).
 *
 * Single-button two-state control (unlike Switch). Off: transparent w/
 * border; hover: `bg-accent`; pressed: primary fill. Base UI exposes
 * the pressed flag as `data-pressed`.
 *
 * Size + variant CVA is preserved because `toggle-group.tsx` imports
 * `toggleVariants` and layers its own `data-spacing` rules on top.
 */
const toggleVariants = cva(
  cn(
    "group/toggle inline-flex items-center justify-center gap-1 whitespace-nowrap",
    "text-sm font-medium transition-colors duration-150 select-none outline-none",
    // Focus ring
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    // Disabled
    "disabled:pointer-events-none disabled:opacity-50",
    // Pressed state → primary fill
    "data-pressed:bg-primary data-pressed:text-primary-foreground",
    // Invalid
    "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/40",
    // Icon defaults
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ),
  {
    variants: {
      variant: {
        default: "bg-transparent text-foreground rounded-md hover:bg-accent hover:text-foreground",
        outline:
          "border border-border bg-transparent text-foreground rounded-md hover:bg-accent hover:text-foreground",
      },
      size: {
        default: "h-10 min-w-10 px-3",
        sm: "h-8 min-w-8 rounded-sm px-2.5 text-[0.8125rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 min-w-12 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      data-variant={variant}
      data-size={size}
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
