/**
 * Tooltip — tests for the Phase 3 Liquid Glass floating primitive (Task 6).
 *
 * Base UI's Tooltip portals the popup to document.body and is driven by the
 * data-open / data-closed idioms. We set delay=0 via the provider so the
 * popup can render synchronously when the trigger is hovered.
 */
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

function renderTooltip() {
  return render(
    <TooltipProvider delay={0}>
      <Tooltip open>
        <TooltipTrigger>trigger</TooltipTrigger>
        <TooltipContent>tip</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

describe("Tooltip — Liquid Glass", () => {
  it("exposes data-slot=\"tooltip-content\" on the popup", () => {
    renderTooltip()
    expect(
      document.querySelector('[data-slot="tooltip-content"]')
    ).not.toBeNull()
  })

  it("applies the glass surface class cluster", () => {
    renderTooltip()
    const content = document.querySelector(
      '[data-slot="tooltip-content"]'
    ) as HTMLElement
    expect(content.className).toContain("bg-[var(--glass-tint-light)]")
    expect(content.className).toContain("dark:bg-[var(--glass-tint-dark)]")
    expect(content.className).toContain("backdrop-blur-[var(--glass-blur)]")
    expect(content.className).toContain(
      "backdrop-saturate-[var(--glass-saturate)]"
    )
  })

  it("preserves animation utilities", () => {
    renderTooltip()
    const content = document.querySelector(
      '[data-slot="tooltip-content"]'
    ) as HTMLElement
    expect(content.className).toContain("data-open:animate-in")
    expect(content.className).toContain("data-closed:animate-out")
  })
})
