import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

/**
 * Switch — state tier (Phase 3 Liquid Glass rebuild, Task 5).
 *
 * Track flips between `bg-border` (off) and `bg-primary` (on, via
 * Base UI's `data-checked`). Thumb is a white circle that slides across
 * the track with a 150 ms transform transition. `data-slot` hooks are
 * preserved so Task 6's glass selectors can target Switch parts.
 *
 * Size variants (`default`, `sm`) are preserved for downstream call
 * sites that predate the rebuild.
 */
function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full",
        "transition-colors duration-150 outline-none",
        // Track colors driven by data-checked
        "bg-border data-checked:bg-primary",
        // Focus ring
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        // Disabled
        "data-disabled:cursor-not-allowed data-disabled:opacity-50 disabled:cursor-not-allowed disabled:opacity-50",
        // Sizes
        "data-[size=default]:h-6 data-[size=default]:w-11",
        "data-[size=sm]:h-4 data-[size=sm]:w-7",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-sm ring-0",
          "transition-transform duration-150",
          // Default size thumb: 1.25rem (size-5), travel 1.375rem
          "group-data-[size=default]/switch:size-5 group-data-[size=default]/switch:translate-x-0.5",
          "group-data-[size=default]/switch:data-checked:translate-x-[1.375rem]",
          // Small size thumb: size-3, travel 0.875rem
          "group-data-[size=sm]/switch:size-3 group-data-[size=sm]/switch:translate-x-0.5",
          "group-data-[size=sm]/switch:data-checked:translate-x-[0.875rem]",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
