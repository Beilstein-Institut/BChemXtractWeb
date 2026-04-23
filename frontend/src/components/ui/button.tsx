import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Button — surface tier (Phase 3 Liquid Glass rebuild, Task 18).
 *
 * Variants:
 *   primary      — navy base + crimson inner glow
 *   default      — alias for primary (~10 legacy call sites)
 *   secondary    — navy base + teal glow
 *   outline      — transparent fill + crimson→teal gradient border
 *   ghost        — transparent; shiny primary fill on hover
 *   destructive  — navy base + red/crimson glow
 *
 * Visual treatment is implemented by `.btn-shiny-*` utility classes
 * in `src/index.css` (@layer components) so the CVA stays terse.
 * The shared `.btn-shiny` base supplies position/overflow/transition
 * and a `box-shadow` glow on hover keyed off `--shiny-accent`.
 *
 * The legacy `link` variant is dropped per the plan — migrated to
 * `ghost` with `data-underline`.
 *
 * `data-variant` is preserved on the DOM element so Task 6's glass
 * selectors and any existing CSS can target the chosen variant.
 */
const buttonVariants = cva(
  cn(
    "btn-shiny",
    "group/button inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-md text-sm font-medium select-none outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
    "active:not-aria-[haspopup]:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:ring-2 aria-invalid:ring-destructive/40",
    "data-[underline=true]:underline data-[underline=true]:underline-offset-4",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ),
  {
    variants: {
      variant: {
        primary: "btn-shiny-primary",
        default: "btn-shiny-primary",
        secondary: "btn-shiny-secondary",
        outline: "btn-shiny-outline",
        ghost: "btn-shiny-ghost",
        destructive: "btn-shiny-destructive",
      },
      size: {
        default: "h-10 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        sm: "h-8 px-3 text-[0.8125rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 px-5 text-[0.9375rem] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-10",
        // Legacy sizes preserved for downstream call sites that have not
        // yet migrated to the new scale. Safe to narrow in a follow-up pass.
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-md",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
