import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Badge — surface tier chip for tags / counts / status.
 *
 * Variants (Phase 3 Liquid Glass rebuild, Task 3):
 *   default    — primary tint (crimson)
 *   secondary  — secondary tint (teal)
 *   outline    — transparent with border
 *   success    — success-toned (green via OKLCH mix)
 *   warning    — warning-toned (amber via OKLCH mix)
 *
 * Legacy `ghost`, `destructive`, and `link` variants from the pre-Phase-3
 * Badge are intentionally dropped — no call site in this repo references
 * them (verified via grep over frontend/src before rewrite).
 *
 * `data-slot="badge"` is preserved for Task 6 glass selectors + tests.
 */
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:ring-2 aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground [a]:hover:opacity-90",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:opacity-90",
        outline:
          "border-border bg-transparent text-foreground [a]:hover:bg-accent",
        success:
          "bg-[color-mix(in_oklch,oklch(0.65_0.16_155)_18%,transparent)] text-[oklch(0.35_0.16_155)] dark:text-[oklch(0.80_0.14_155)]",
        warning:
          "bg-[color-mix(in_oklch,oklch(0.78_0.17_75)_22%,transparent)] text-[oklch(0.42_0.15_70)] dark:text-[oklch(0.85_0.12_75)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        "data-slot": "badge",
        "data-variant": variant,
        className: cn(badgeVariants({ variant }), className),
      } as React.ComponentProps<"span">,
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
