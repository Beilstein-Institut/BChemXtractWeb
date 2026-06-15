/**
 * HoverCard — tests for the Liquid Glass floating primitive.
 * Backed by Base UI's PreviewCard. Portals to document.body.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

function renderHoverCard() {
  return render(
    <HoverCard open>
      <HoverCardTrigger>trigger</HoverCardTrigger>
      <HoverCardContent>preview</HoverCardContent>
    </HoverCard>,
  );
}

describe("HoverCard — Liquid Glass", () => {
  it('exposes data-slot="hover-card-content" on the popup', () => {
    renderHoverCard();
    expect(document.querySelector('[data-slot="hover-card-content"]')).not.toBeNull();
  });

  it("applies the glass surface class cluster", () => {
    renderHoverCard();
    const content = document.querySelector('[data-slot="hover-card-content"]') as HTMLElement;
    expect(content.className).toContain("bg-[var(--glass-tint-light)]");
    expect(content.className).toContain("dark:bg-[var(--glass-tint-dark)]");
    expect(content.className).toContain("backdrop-blur-[var(--glass-blur)]");
    expect(content.className).toContain("backdrop-saturate-[var(--glass-saturate)]");
  });
});
