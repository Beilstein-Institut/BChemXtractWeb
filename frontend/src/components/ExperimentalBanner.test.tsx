/**
 * Tests for ExperimentalBanner component.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * Plan 10-04 D-09 / UI-SPEC §2 — dismissible amber banner with
 * sessionStorage-backed state (NOT localStorage per Pitfall 7).
 *
 * Environment note: this project's jsdom configuration exposes
 * `window.sessionStorage` as a fully-functional Storage object, while
 * `window.localStorage` is a stub whose methods are not callable
 * (matches the pre-existing `App.test.tsx` ThemeProvider failures
 * logged in STATE.md / deferred-items.md). Pitfall 7 is therefore
 * verified indirectly via a `vi.spyOn` guard on `localStorage.setItem`
 * (asserts the spy is never called) rather than by reading a value
 * back out of `localStorage.getItem`.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, afterEach, vi } from "vitest";
import { ExperimentalBanner } from "./ExperimentalBanner";

const STORAGE_KEY = "bcx.reactions.experimentalBannerDismissed";

describe("ExperimentalBanner", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders container with role='note' and amber accent classes", () => {
    render(<ExperimentalBanner />);
    const note = screen.getByRole("note");
    expect(note.className).toMatch(/border-l-amber-500/);
    expect(note.className).toMatch(/bg-amber-50/);
  });

  it("renders AlertTriangleIcon and dismiss button with aria-label", () => {
    render(<ExperimentalBanner />);
    expect(
      screen.getByRole("button", { name: /dismiss experimental disclaimer/i }),
    ).toBeInTheDocument();
  });

  it("lead word 'Experimental.' is visually prominent (font-semibold)", () => {
    render(<ExperimentalBanner />);
    const span = screen.getByText("Experimental.");
    expect(span.className).toMatch(/font-semibold/);
  });

  it("click dismiss unmounts the banner", () => {
    const { container } = render(<ExperimentalBanner />);
    expect(container.querySelector("[role='note']")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /dismiss experimental/i }),
    );
    expect(container.querySelector("[role='note']")).toBeNull();
  });

  it("click dismiss writes sessionStorage bcx.reactions.experimentalBannerDismissed = '1'", () => {
    render(<ExperimentalBanner />);
    fireEvent.click(
      screen.getByRole("button", { name: /dismiss experimental/i }),
    );
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  it("does NOT persist to localStorage (Pitfall 7)", () => {
    // Install a callable stub on localStorage so vi.spyOn has a function to
    // wrap (the jsdom stub has no callable setItem by default). If the
    // banner ever hits localStorage, the spy will record it — and we assert
    // it is NEVER called.
    const localStorageStub = { setItem: vi.fn(), getItem: vi.fn() };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageStub,
    });
    render(<ExperimentalBanner />);
    fireEvent.click(
      screen.getByRole("button", { name: /dismiss experimental/i }),
    );
    expect(localStorageStub.setItem).not.toHaveBeenCalled();
  });

  it("returns null on mount when sessionStorage already has dismissed=1", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "1");
    const { container } = render(<ExperimentalBanner />);
    expect(container.querySelector("[role='note']")).toBeNull();
  });
});
