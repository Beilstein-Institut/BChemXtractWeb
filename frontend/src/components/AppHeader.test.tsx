/**
 * AppHeader — tests for the Phase 3 Liquid Glass chrome top bar (Task 7).
 *
 * Mocks @base-ui/react/menu + SearchInput + ChemistryThemeSwitch to
 * isolate the header shell. Asserts the sticky + glass token class
 * cluster and `data-slot` contract plus the Logo wordmark.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppHeader } from "./AppHeader";

vi.mock("./SearchInput", () => ({
  SearchInput: () => <div data-testid="search-input" />,
}));

vi.mock("./ChemistryThemeSwitch", () => ({
  ChemistryThemeSwitch: () => <label data-slot="theme-switch" aria-label="Switch to dark mode" />,
}));

describe("AppHeader", () => {
  it('exposes data-slot="app-header"', () => {
    render(<AppHeader />);
    expect(document.querySelector('header[data-slot="app-header"]')).not.toBeNull();
  });

  it("applies the Liquid Glass token class cluster", () => {
    render(<AppHeader />);
    const header = document.querySelector('header[data-slot="app-header"]') as HTMLElement;
    expect(header.className).toContain("bg-[var(--glass-tint-light)]");
    expect(header.className).toContain("dark:bg-[var(--glass-tint-dark)]");
    expect(header.className).toContain("backdrop-blur-[var(--glass-blur)]");
    expect(header.className).toContain("backdrop-saturate-[var(--glass-saturate)]");
    expect(header.className).toContain("border-[var(--glass-border)]");
  });

  it("is sticky to the top of the viewport", () => {
    render(<AppHeader />);
    const header = document.querySelector('header[data-slot="app-header"]') as HTMLElement;
    expect(header.className).toContain("sticky");
    expect(header.className).toContain("top-0");
  });

  it("has a 64px tall inner row (h-16)", () => {
    render(<AppHeader />);
    const inner = document.querySelector('header[data-slot="app-header"] > div') as HTMLElement;
    expect(inner.className).toContain("h-16");
  });

  it("renders the BChemXtract wordmark Logo", () => {
    render(<AppHeader />);
    const logo = screen.getByLabelText("BChemXtract home");
    expect(logo).toBeInTheDocument();
    expect(logo.getAttribute("data-slot")).toBe("app-logo");
  });

  it("renders the main nav via NavLinks", () => {
    render(<AppHeader />);
    const nav = screen.getByLabelText("Main navigation");
    expect(nav).toBeInTheDocument();
    expect(nav.getAttribute("data-slot")).toBe("nav-links");
  });

  it("wraps NavLinks in a centered pill container", () => {
    render(<AppHeader />);
    const pill = document.querySelector('[data-slot="nav-pill"]');
    expect(pill).not.toBeNull();
    expect(pill?.className).toContain("rounded-full");
    // NavLinks lives inside the pill.
    expect(pill?.querySelector('[data-slot="nav-links"]')).not.toBeNull();
  });

  it("groups search + theme switch in the right-cluster slot", () => {
    render(<AppHeader />);
    const cluster = document.querySelector('[data-slot="header-right-cluster"]');
    expect(cluster).not.toBeNull();
    expect(cluster?.querySelector('[data-testid="search-input"]')).not.toBeNull();
    expect(cluster?.querySelector('[data-slot="theme-switch"]')).not.toBeNull();
  });

  it("renders the stubbed ChemistryThemeSwitch trigger", () => {
    render(<AppHeader />);
    expect(document.querySelector('[data-slot="theme-switch"]')).not.toBeNull();
  });

  it("renders the mobile hamburger trigger", () => {
    render(<AppHeader />);
    expect(screen.getByLabelText("Open navigation menu")).toBeInTheDocument();
  });
});
