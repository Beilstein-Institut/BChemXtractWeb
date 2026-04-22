/**
 * DropdownMenu — tests for the Phase 3 Liquid Glass floating primitive
 * (Task 6). Base UI-backed menu with data-open / data-closed idioms.
 * Portals to document.body.
 */
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function renderMenu() {
  return render(
    <DropdownMenu open>
      <DropdownMenuTrigger>open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>One</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe("DropdownMenu — Liquid Glass", () => {
  it("exposes data-slot=\"dropdown-menu-content\" on the popup", () => {
    renderMenu()
    expect(
      document.querySelector('[data-slot="dropdown-menu-content"]')
    ).not.toBeNull()
  })

  it("applies the glass surface class cluster", () => {
    renderMenu()
    const content = document.querySelector(
      '[data-slot="dropdown-menu-content"]'
    ) as HTMLElement
    expect(content.className).toContain("bg-[var(--glass-tint-light)]")
    expect(content.className).toContain("dark:bg-[var(--glass-tint-dark)]")
    expect(content.className).toContain("backdrop-blur-[var(--glass-blur)]")
    expect(content.className).toContain(
      "backdrop-saturate-[var(--glass-saturate)]"
    )
    expect(content.className).toContain("border-[var(--glass-border)]")
  })

  it("preserves open/close animations", () => {
    renderMenu()
    const content = document.querySelector(
      '[data-slot="dropdown-menu-content"]'
    ) as HTMLElement
    expect(content.className).toContain("data-open:animate-in")
    expect(content.className).toContain("data-closed:animate-out")
  })
})
