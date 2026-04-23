/**
 * Select — tests for the Phase 3 Liquid Glass form primitive (Task 4).
 *
 * Covers: render with a static trigger, data-slot contract on the trigger,
 * plan-specified form-tier styling on the trigger, and the disclosure flow
 * (click trigger -> options render -> clicking an option fires
 * onValueChange with the clicked value).
 *
 * Base UI Select portals its popup to `document.body`. Testing Library's
 * `screen` queries the entire document by default so portaled options are
 * reachable without special configuration. We use `userEvent` rather than
 * `fireEvent` because the Base UI disclosure chain depends on
 * pointer/keyboard semantics that jsdom only wires through user-event.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function renderSelect(onValueChange?: (v: string) => void) {
  return render(
    <Select onValueChange={onValueChange}>
      <SelectTrigger aria-label="fruit">
        <SelectValue placeholder="pick one" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="cherry">Cherry</SelectItem>
      </SelectContent>
    </Select>,
  );
}

describe("Select", () => {
  it("renders the trigger", () => {
    renderSelect();
    expect(screen.getByRole("combobox", { name: "fruit" })).toBeInTheDocument();
  });

  it('exposes data-slot="select-trigger" on the trigger', () => {
    renderSelect();
    const trigger = screen.getByRole("combobox", { name: "fruit" });
    expect(trigger.getAttribute("data-slot")).toBe("select-trigger");
  });

  it("applies the form-tier surface classes on the trigger", () => {
    renderSelect();
    const trigger = screen.getByRole("combobox", { name: "fruit" });
    expect(trigger.className).toContain("bg-surface-muted");
    expect(trigger.className).toContain("border-border");
    expect(trigger.className).toContain("rounded-sm");
  });

  it("applies focus-visible ring classes on the trigger", () => {
    renderSelect();
    const trigger = screen.getByRole("combobox", { name: "fruit" });
    expect(trigger.className).toContain("focus-visible:ring-2");
    expect(trigger.className).toContain("focus-visible:ring-ring");
  });

  it("opens the popup and reveals options when the trigger is clicked", async () => {
    const user = userEvent.setup();
    renderSelect();
    await user.click(screen.getByRole("combobox", { name: "fruit" }));
    expect(await screen.findByRole("option", { name: "Apple" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Banana" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Cherry" })).toBeInTheDocument();
  });

  it("fires onValueChange with the clicked option's value", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    renderSelect(onValueChange);
    await user.click(screen.getByRole("combobox", { name: "fruit" }));
    await user.click(await screen.findByRole("option", { name: "Banana" }));
    expect(onValueChange).toHaveBeenCalled();
    // First positional arg of the first call is the new value.
    expect(onValueChange.mock.calls[0][0]).toBe("banana");
  });

  it('exposes data-slot="select-content" on the popup once open', async () => {
    const user = userEvent.setup();
    renderSelect();
    await user.click(screen.getByRole("combobox", { name: "fruit" }));
    // findByRole wait for the popup render; then resolve its data-slot.
    const option = await screen.findByRole("option", { name: "Apple" });
    const popup = option.closest('[data-slot="select-content"]');
    expect(popup).not.toBeNull();
  });

  it("applies the Liquid Glass surface cluster to the popup (Task 6)", async () => {
    const user = userEvent.setup();
    renderSelect();
    await user.click(screen.getByRole("combobox", { name: "fruit" }));
    const option = await screen.findByRole("option", { name: "Apple" });
    const popup = option.closest('[data-slot="select-content"]') as HTMLElement;
    expect(popup).not.toBeNull();
    expect(popup.className).toContain("bg-[var(--glass-tint-light)]");
    expect(popup.className).toContain("dark:bg-[var(--glass-tint-dark)]");
    expect(popup.className).toContain("backdrop-blur-[var(--glass-blur)]");
    expect(popup.className).toContain("backdrop-saturate-[var(--glass-saturate)]");
    expect(popup.className).toContain("border-[var(--glass-border)]");
  });
});
