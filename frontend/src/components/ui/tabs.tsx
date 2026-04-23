import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Tabs — state tier (Phase 3 Liquid Glass rebuild, Task 5).
 *
 * Pill-shaped container: `bg-surface-muted rounded-full p-1 inline-flex`.
 * Trigger uses Base UI's `data-active` attribute (confirmed from
 * `TabsTabDataAttributes.d.ts`) to swap to the primary fill on the
 * selected trigger. `data-slot` hooks are preserved so Task 6's glass
 * selectors can target Tabs parts.
 *
 * The `line` variant is preserved for downstream call sites that use a
 * border-underline style rather than the pill fill.
 */

function Tabs({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex items-center justify-center text-foreground-muted",
  {
    variants: {
      variant: {
        default: "bg-surface-muted rounded-full p-1 group-data-vertical/tabs:flex-col",
        line: "gap-1 bg-transparent rounded-none group-data-vertical/tabs:flex-col",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        // Base shape + typography
        "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
        "px-3 py-1.5 text-sm font-medium",
        "transition-colors duration-150 select-none outline-none",
        // Focus ring
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        // Disabled
        "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
        // Icon defaults
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Pill variant (default): rounded-full, primary fill when active
        "group-data-[variant=default]/tabs-list:rounded-full",
        "group-data-[variant=default]/tabs-list:hover:text-foreground",
        "group-data-[variant=default]/tabs-list:data-active:bg-primary",
        "group-data-[variant=default]/tabs-list:data-active:text-primary-foreground",
        // Line variant: underline on active, no fill
        "group-data-[variant=line]/tabs-list:rounded-none",
        "group-data-[variant=line]/tabs-list:bg-transparent",
        "group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "group-data-[variant=line]/tabs-list:data-active:text-foreground",
        // Underline element for line variant
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity",
        "group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:-bottom-1 group-data-horizontal/tabs:after:h-0.5",
        "group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5",
        "group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
