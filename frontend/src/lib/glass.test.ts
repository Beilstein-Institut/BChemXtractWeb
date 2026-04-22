/**
 * glass — tests for the shared Liquid Glass class cluster helper (Task 6).
 *
 * These are presence checks rather than visual assertions: the purpose is
 * to catch accidental edits that drop a token-driven utility (e.g. removing
 * the `dark:` tint or the `backdrop-saturate` line) before they land in a
 * re-skinned primitive downstream.
 */
import { describe, it, expect } from "vitest"
import { glassOverlayClasses, glassSurfaceClasses } from "@/lib/glass"

describe("glassSurfaceClasses", () => {
  it("includes light and dark tint tokens", () => {
    expect(glassSurfaceClasses).toContain("bg-[var(--glass-tint-light)]")
    expect(glassSurfaceClasses).toContain("dark:bg-[var(--glass-tint-dark)]")
  })

  it("includes backdrop blur + saturate tokens", () => {
    expect(glassSurfaceClasses).toContain("backdrop-blur-[var(--glass-blur)]")
    expect(glassSurfaceClasses).toContain(
      "backdrop-saturate-[var(--glass-saturate)]"
    )
  })

  it("includes the glass border and elevation shadow", () => {
    expect(glassSurfaceClasses).toContain("border-[var(--glass-border)]")
    expect(glassSurfaceClasses).toContain("shadow-lg")
  })
})

describe("glassOverlayClasses", () => {
  it("uses the token-driven foreground dim", () => {
    expect(glassOverlayClasses).toContain("bg-foreground/30")
  })

  it("gates the backdrop blur behind supports-backdrop-filter", () => {
    expect(glassOverlayClasses).toContain(
      "supports-backdrop-filter:backdrop-blur-sm"
    )
  })
})
