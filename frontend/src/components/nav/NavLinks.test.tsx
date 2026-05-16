/**
 * NavLinks — tests for the Phase 3 Liquid Glass primary nav (Task 7).
 *
 * Covers: 5-link render, `data-slot` contract, active-route styling
 * + aria-current, path-prefix detection (`/browse/123` → Browse active),
 * and root-only match for Extract (`/` must not match `/browse`).
 *
 * The Settings link was added in Phase 11 (D-07) for the recovery code +
 * restore + delete-my-data surface.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavLinks } from "./NavLinks";

function setPathname(pathname: string) {
  window.history.replaceState(null, "", pathname);
}

beforeEach(() => {
  setPathname("/");
});

describe("NavLinks", () => {
  it("renders all five routes", () => {
    render(<NavLinks />);
    expect(screen.getByText("Extract")).toBeInTheDocument();
    expect(screen.getByText("Browse")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
  });

  it('exposes data-slot="nav-links" on the nav wrapper', () => {
    render(<NavLinks />);
    expect(screen.getByLabelText("Main navigation").getAttribute("data-slot")).toBe("nav-links");
  });

  it('stamps data-slot="nav-link" on each link', () => {
    render(<NavLinks />);
    const links = document.querySelectorAll('[data-slot="nav-link"]');
    expect(links.length).toBe(5);
  });

  it("marks Extract active on /", () => {
    setPathname("/");
    render(<NavLinks />);
    const extract = screen.getByText("Extract");
    expect(extract.getAttribute("data-active")).toBe("true");
    expect(extract.getAttribute("aria-current")).toBe("page");
  });

  it("does NOT mark Extract active on /browse (root-only match)", () => {
    setPathname("/browse");
    render(<NavLinks />);
    const extract = screen.getByText("Extract");
    expect(extract.getAttribute("data-active")).toBeNull();
  });

  it("marks Browse active on /browse", () => {
    setPathname("/browse");
    render(<NavLinks />);
    const browse = screen.getByText("Browse");
    expect(browse.getAttribute("data-active")).toBe("true");
  });

  it("marks Browse active on nested /browse/123", () => {
    setPathname("/browse/123");
    render(<NavLinks />);
    const browse = screen.getByText("Browse");
    expect(browse.getAttribute("data-active")).toBe("true");
  });

  it("applies the accent pill utility classes when active", () => {
    setPathname("/history");
    render(<NavLinks />);
    const history = screen.getByText("History");
    expect(history.className).toContain("bg-accent");
    expect(history.className).toContain("text-primary");
    expect(history.className).toContain("font-semibold");
  });

  it("forwards className to the nav root", () => {
    render(<NavLinks className="hidden lg:flex" />);
    const nav = screen.getByLabelText("Main navigation");
    expect(nav.className).toContain("hidden");
    expect(nav.className).toContain("lg:flex");
  });
});
