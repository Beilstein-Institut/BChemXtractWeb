import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { BrandName } from "./BrandName";

describe("BrandName", () => {
  it("renders the full BChemXtract wordmark as one logical word", () => {
    const { container } = render(<BrandName />);
    const root = container.querySelector('[data-slot="brand-name"]');
    expect(root).not.toBeNull();
    expect(root!.textContent).toBe("BChemXtract");
  });

  it("applies brand font + medium weight on the outer span", () => {
    const { container } = render(<BrandName />);
    const root = container.querySelector(
      '[data-slot="brand-name"]',
    ) as HTMLElement;
    expect(root.className).toContain("font-brand");
    expect(root.className).toContain("font-medium");
  });

  it("bolds the BC and X fragments", () => {
    const { container } = render(<BrandName />);
    const bolded = container.querySelectorAll(
      '[data-slot="brand-name"] > .font-bold',
    );
    expect(bolded).toHaveLength(2);
    expect(bolded[0].textContent).toBe("BC");
    expect(bolded[1].textContent).toBe("X");
  });

  it("tints the X fragment with the crimson primary", () => {
    const { container } = render(<BrandName />);
    const crimsonX = container.querySelector(
      '[data-slot="brand-name"] > .text-primary',
    ) as HTMLElement | null;
    expect(crimsonX).not.toBeNull();
    expect(crimsonX!.textContent).toBe("X");
    // The crimson X is also bold.
    expect(crimsonX!.className).toContain("font-bold");
  });

  it("appends a medium-weight Web suffix when requested", () => {
    const { container } = render(<BrandName suffix="Web" />);
    const root = container.querySelector('[data-slot="brand-name"]');
    expect(root!.textContent).toBe("BChemXtractWeb");
    // "Web" is an unbolded fragment; only BC and X stay bold.
    const bolded = container.querySelectorAll(
      '[data-slot="brand-name"] > .font-bold',
    );
    expect(bolded).toHaveLength(2);
  });

  it("forwards arbitrary span props (className, data-*)", () => {
    const { container } = render(
      <BrandName className="custom-x" data-testid="brand" />,
    );
    const root = container.querySelector(
      '[data-slot="brand-name"]',
    ) as HTMLElement;
    expect(root.className).toContain("custom-x");
    expect(root.getAttribute("data-testid")).toBe("brand");
  });
});
