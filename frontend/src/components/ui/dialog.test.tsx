/**
 * Dialog — tests for the Phase 3 Liquid Glass floating primitive (Task 6).
 *
 * Covers: data-slot contract on overlay + content, presence of the glass
 * surface class cluster, token-driven overlay, and open/close animation
 * utilities. Dialog is Radix-flavored Base UI (@base-ui/react/dialog): the
 * popup uses Base UI's data-open / data-closed attrs, NOT data-state.
 *
 * Base UI's Dialog.Popup portals to document.body, so screen queries reach
 * it without a container prop.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function renderDialog() {
  return render(
    <Dialog open>
      <DialogTrigger>open</DialogTrigger>
      <DialogContent>
        <DialogTitle>Title</DialogTitle>
        <DialogDescription>Description</DialogDescription>
      </DialogContent>
    </Dialog>,
  );
}

describe("Dialog — Liquid Glass", () => {
  it('exposes data-slot="dialog-content" on the popup', () => {
    renderDialog();
    const content = document.querySelector('[data-slot="dialog-content"]');
    expect(content).not.toBeNull();
  });

  it("applies the glass surface class cluster to the content", () => {
    renderDialog();
    const content = document.querySelector('[data-slot="dialog-content"]') as HTMLElement;
    expect(content).not.toBeNull();
    expect(content.className).toContain("bg-[var(--glass-tint-light)]");
    expect(content.className).toContain("dark:bg-[var(--glass-tint-dark)]");
    expect(content.className).toContain("backdrop-blur-[var(--glass-blur)]");
    expect(content.className).toContain("backdrop-saturate-[var(--glass-saturate)]");
    expect(content.className).toContain("border-[var(--glass-border)]");
  });

  it("keeps the open/close animation utilities on the content", () => {
    renderDialog();
    const content = document.querySelector('[data-slot="dialog-content"]') as HTMLElement;
    expect(content.className).toContain("data-open:animate-in");
    expect(content.className).toContain("data-open:fade-in-0");
    expect(content.className).toContain("data-open:zoom-in-95");
    expect(content.className).toContain("data-closed:animate-out");
  });

  it("applies the token-driven overlay tint to the backdrop", () => {
    renderDialog();
    const overlay = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.className).toContain("bg-foreground/30");
  });

  it("exposes title and description via data-slot", () => {
    renderDialog();
    expect(screen.getByText("Title").closest('[data-slot="dialog-title"]')).not.toBeNull();
    expect(
      screen.getByText("Description").closest('[data-slot="dialog-description"]'),
    ).not.toBeNull();
  });
});
