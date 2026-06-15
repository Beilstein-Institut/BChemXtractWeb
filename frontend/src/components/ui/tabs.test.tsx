/**
 * Tabs — tests for the Liquid Glass state primitive.
 *
 * Covers: render, data-slot contract on Tabs/List/Trigger/Panel,
 * Base UI data-active on the selected trigger, switch-behavior when a
 * non-active trigger is clicked, and pill-variant + trigger styling
 * (bg-surface-muted, rounded-full, data-active:bg-primary).
 *
 * Base UI's Tab emits `data-active` when selected (confirmed from
 * `TabsTabDataAttributes.d.ts`) — NOT `data-state="active"`.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function renderTabs() {
  return render(
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">Tab A</TabsTrigger>
        <TabsTrigger value="b">Tab B</TabsTrigger>
        <TabsTrigger value="c">Tab C</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Panel A</TabsContent>
      <TabsContent value="b">Panel B</TabsContent>
      <TabsContent value="c">Panel C</TabsContent>
    </Tabs>,
  );
}

describe("Tabs", () => {
  it("renders all triggers", () => {
    renderTabs();
    expect(screen.getByRole("tab", { name: "Tab A" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab B" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab C" })).toBeInTheDocument();
  });

  it('exposes data-slot="tabs-list" on the list', () => {
    const { container } = renderTabs();
    const list = container.querySelector('[data-slot="tabs-list"]');
    expect(list).not.toBeNull();
  });

  it('exposes data-slot="tabs-trigger" on every trigger', () => {
    renderTabs();
    const triggers = screen.getAllByRole("tab");
    for (const t of triggers) {
      expect(t.getAttribute("data-slot")).toBe("tabs-trigger");
    }
  });

  it('exposes data-slot="tabs-panel" on the visible panel', () => {
    renderTabs();
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("data-slot")).toBe("tabs-panel");
  });

  it("marks the default-selected trigger with data-active", () => {
    renderTabs();
    const a = screen.getByRole("tab", { name: "Tab A" });
    expect(a.getAttribute("data-active")).toBe("");
  });

  it("does not mark inactive triggers with data-active", () => {
    renderTabs();
    const b = screen.getByRole("tab", { name: "Tab B" });
    expect(b.getAttribute("data-active")).toBeNull();
  });

  it("switches panels when a different trigger is clicked", () => {
    renderTabs();
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel A");
    fireEvent.click(screen.getByRole("tab", { name: "Tab B" }));
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel B");
  });

  it("moves data-active after a switch", () => {
    renderTabs();
    fireEvent.click(screen.getByRole("tab", { name: "Tab C" }));
    const a = screen.getByRole("tab", { name: "Tab A" });
    const c = screen.getByRole("tab", { name: "Tab C" });
    expect(a.getAttribute("data-active")).toBeNull();
    expect(c.getAttribute("data-active")).toBe("");
  });

  it("applies pill-shaped list styling (bg-surface-muted, rounded-full)", () => {
    const { container } = renderTabs();
    const list = container.querySelector('[data-slot="tabs-list"]') as HTMLElement;
    expect(list.className).toContain("bg-surface-muted");
    expect(list.className).toContain("rounded-full");
  });

  it("applies the primary-fill class on triggers via data-active selector", () => {
    renderTabs();
    const trigger = screen.getByRole("tab", { name: "Tab A" });
    expect(trigger.className).toContain(
      "group-data-[variant=default]/tabs-list:data-active:bg-primary",
    );
    expect(trigger.className).toContain(
      "group-data-[variant=default]/tabs-list:data-active:text-primary-foreground",
    );
  });

  it("applies focus-visible ring classes on triggers", () => {
    renderTabs();
    const trigger = screen.getByRole("tab", { name: "Tab A" });
    expect(trigger.className).toContain("focus-visible:ring-2");
    expect(trigger.className).toContain("focus-visible:ring-ring");
  });

  it("reflects the List variant via data-variant (default)", () => {
    const { container } = renderTabs();
    const list = container.querySelector('[data-slot="tabs-list"]') as HTMLElement;
    expect(list.getAttribute("data-variant")).toBe("default");
  });
});
