/**
 * Popover — tests for the Liquid Glass floating primitive.
 *
 * Base UI's Popover uses data-open / data-closed idioms (not data-state).
 * The popup portals to document.body, so we query the whole document.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function renderPopover() {
  return render(
    <Popover open>
      <PopoverTrigger>open</PopoverTrigger>
      <PopoverContent>content</PopoverContent>
    </Popover>,
  );
}

describe("Popover — Liquid Glass", () => {
  it('exposes data-slot="popover-content" on the popup', () => {
    renderPopover();
    expect(document.querySelector('[data-slot="popover-content"]')).not.toBeNull();
  });

  it("applies the glass surface class cluster", () => {
    renderPopover();
    const content = document.querySelector('[data-slot="popover-content"]') as HTMLElement;
    expect(content.className).toContain("bg-[var(--glass-tint-light)]");
    expect(content.className).toContain("dark:bg-[var(--glass-tint-dark)]");
    expect(content.className).toContain("backdrop-blur-[var(--glass-blur)]");
    expect(content.className).toContain("backdrop-saturate-[var(--glass-saturate)]");
    expect(content.className).toContain("border-[var(--glass-border)]");
  });

  it("preserves the side-based slide-in animation classes", () => {
    renderPopover();
    const content = document.querySelector('[data-slot="popover-content"]') as HTMLElement;
    expect(content.className).toContain("data-[side=bottom]:slide-in-from-top-2");
    expect(content.className).toContain("data-open:animate-in");
    expect(content.className).toContain("data-closed:animate-out");
  });
});
