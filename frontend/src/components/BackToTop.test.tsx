/**
 * BackToTop tests — reveal threshold (one viewport) and scroll-to-top action.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BackToTop } from "./BackToTop";

function setScroll(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  act(() => window.dispatchEvent(new Event("scroll")));
}

beforeEach(() => {
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  window.scrollTo = vi.fn();
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});

afterEach(() => vi.restoreAllMocks());

describe("BackToTop", () => {
  it("is hidden within one viewport and shown past it", () => {
    const { container } = render(<BackToTop />);
    const btn = container.querySelector('[data-slot="back-to-top"]')!;

    expect(btn).toHaveAttribute("aria-hidden", "true");
    setScroll(801);
    expect(btn).toHaveAttribute("aria-hidden", "false");
    setScroll(0);
    expect(btn).toHaveAttribute("aria-hidden", "true");
  });

  it("smooth-scrolls to top on click", async () => {
    const { container } = render(<BackToTop />);
    setScroll(1000);
    await userEvent.click(container.querySelector('[data-slot="back-to-top"]')!);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("jumps instantly when reduced motion is preferred", async () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const { container } = render(<BackToTop />);
    setScroll(1000);
    await userEvent.click(container.querySelector('[data-slot="back-to-top"]')!);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });
});
