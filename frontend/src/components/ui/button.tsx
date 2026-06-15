import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button — surface tier (Liquid Glass rebuild, claymorphism).
 *
 * Variants:
 *   primary      — crimson claymorphism fill
 *   default      — alias for primary (~10 legacy call sites)
 *   secondary    — teal claymorphism fill
 *   outline      — neutral warm off-white with crimson accent inset ring
 *   ghost        — transparent; claymorphism fill on hover
 *   destructive  — red/crimson claymorphism fill
 *
 * Visual treatment is implemented by `.btn-clay-*` utility classes in
 * `src/index.css` (@layer components) so the CVA stays terse. The shared
 * `.btn-clay` base supplies the transition + translateY lift on hover and
 * scale(0.95) press on active. Fills are 2-stop vertical gradients
 * (light-to-dark of the variant hue) with multi-layer shadows — outer
 * drop + inner top highlight + inner bottom depth — for a pressed-clay
 * silhouette.
 *
 * Optional `icon` prop renders a lucide icon inside a circular
 * semi-transparent white sub-wrapper that brightens on hover and
 * rotates the icon 45°. Matches the dribbble claymorphism "Send"
 * button pattern. Do not pass `icon` for icon-only sizes — the
 * button's main child already is the icon in that case.
 *
 * The legacy `link` variant is dropped — migrated to `ghost` with
 * `data-underline`.
 *
 * `data-variant` is preserved on the DOM element so the glass selectors
 * and any existing CSS can target the chosen variant.
 */
const buttonVariants = cva(
  cn(
    "btn-clay",
    "group/button inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-xl text-sm font-medium select-none outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:ring-2 aria-invalid:ring-destructive/40",
    "data-[underline=true]:underline data-[underline=true]:underline-offset-4",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ),
  {
    variants: {
      variant: {
        primary: "btn-clay-primary",
        default: "btn-clay-primary",
        secondary: "btn-clay-secondary",
        outline: "btn-clay-outline",
        ghost: "btn-clay-ghost",
        destructive: "btn-clay-destructive",
      },
      size: {
        default: "h-10 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        sm: "h-8 px-3 rounded-lg text-[0.8125rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 px-5 text-[0.9375rem] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-10",
        // Legacy sizes preserved for downstream call sites that have not
        // yet migrated to the new scale. Safe to narrow in a follow-up pass.
        xs: "h-6 gap-1 rounded-lg px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        "icon-xs": "size-6 rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-lg",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps extends ButtonPrimitive.Props, VariantProps<typeof buttonVariants> {
  /**
   * Optional icon rendered inside a circular sub-wrapper before the label.
   * Pass a lucide (or other inline SVG) icon — the CSS gives it a
   * semi-transparent white pill background that brightens on hover and
   * rotates the icon 45°. Omit for icon-only buttons (size="icon*");
   * those pass the icon as their main child.
   */
  icon?: React.ReactNode;
}

function Button({
  className,
  variant = "default",
  size = "default",
  icon,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {icon ? (
        <>
          <span className="btn-clay__icon" aria-hidden="true">
            {icon}
          </span>
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
