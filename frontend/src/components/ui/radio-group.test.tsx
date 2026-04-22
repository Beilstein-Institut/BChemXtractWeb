/**
 * RadioGroup — tests for the Phase 3 Liquid Glass state primitive (Task 5).
 *
 * Covers: render, data-slot contract on group + item, single-select
 * behavior (only one item gets data-checked), onValueChange dispatch,
 * plan-specified styling (bg-surface-muted, border-border, rounded-full,
 * data-checked:border-primary), and the focus-visible ring class.
 *
 * Base UI Radio emits `data-checked` on the selected Radio.Root
 * (reuses the checkbox data-attributes set).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

function renderGroup(onValueChange?: (v: string) => void) {
  return render(
    <RadioGroup onValueChange={onValueChange}>
      <RadioGroupItem value="one" aria-label="one" />
      <RadioGroupItem value="two" aria-label="two" />
      <RadioGroupItem value="three" aria-label="three" />
    </RadioGroup>
  );
}

describe("RadioGroup", () => {
  it("renders three radio items", () => {
    renderGroup();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("exposes data-slot=\"radio-group\" on the group root", () => {
    const { container } = renderGroup();
    const root = container.querySelector('[data-slot="radio-group"]');
    expect(root).not.toBeNull();
  });

  it("exposes data-slot=\"radio-group-item\" on every item", () => {
    renderGroup();
    for (const r of screen.getAllByRole("radio")) {
      expect(r.getAttribute("data-slot")).toBe("radio-group-item");
    }
  });

  it("selects only one item at a time via data-checked", () => {
    renderGroup();
    const [one, two, three] = screen.getAllByRole("radio");
    fireEvent.click(two);
    expect(one.getAttribute("data-checked")).toBeNull();
    expect(two.getAttribute("data-checked")).toBe("");
    expect(three.getAttribute("data-checked")).toBeNull();
  });

  it("switches selection when a different item is clicked", () => {
    renderGroup();
    const [one, two, three] = screen.getAllByRole("radio");
    fireEvent.click(two);
    fireEvent.click(three);
    expect(one.getAttribute("data-checked")).toBeNull();
    expect(two.getAttribute("data-checked")).toBeNull();
    expect(three.getAttribute("data-checked")).toBe("");
  });

  it("fires onValueChange with the clicked value", () => {
    const onChange = vi.fn();
    renderGroup(onChange);
    fireEvent.click(screen.getAllByRole("radio")[1]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe("two");
  });

  it("applies the state-tier surface classes on items", () => {
    renderGroup();
    const item = screen.getAllByRole("radio")[0];
    expect(item.className).toContain("bg-surface-muted");
    expect(item.className).toContain("border-border");
    expect(item.className).toContain("rounded-full");
  });

  it("applies the primary-border class via data-checked selector", () => {
    renderGroup();
    const item = screen.getAllByRole("radio")[0];
    expect(item.className).toContain("data-checked:border-primary");
    expect(item.className).toContain("data-checked:bg-primary");
  });

  it("applies focus-visible ring class on items", () => {
    renderGroup();
    const item = screen.getAllByRole("radio")[0];
    expect(item.className).toContain("focus-visible:ring-2");
    expect(item.className).toContain("focus-visible:ring-ring");
  });

  it("mounts the Indicator with data-slot=\"radio-group-indicator\"", () => {
    const { container } = renderGroup();
    // Click to select first so the indicator is rendered
    fireEvent.click(screen.getAllByRole("radio")[0]);
    const indicator = container.querySelector(
      '[data-slot="radio-group-indicator"]'
    );
    expect(indicator).not.toBeNull();
  });
});
