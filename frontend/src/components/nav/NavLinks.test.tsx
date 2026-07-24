/**
 * NavLinks — tests for the Liquid Glass primary nav.
 *
 * Covers: 6-link render, `data-slot` contract, active-route styling
 * + aria-current, path-prefix detection (`/browse/123` → Browse active),
 * and root-only match for Home (`/` must not match `/browse`).
 *
 * The Settings link surfaces the recovery code + restore + delete-my-data
 * controls.
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
  it("renders all routes", () => {
    render(<NavLinks />);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Extract")).toBeInTheDocument();
    expect(screen.getByText("View")).toBeInTheDocument();
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
    expect(links.length).toBe(7);
  });

  it("marks Home active on /", () => {
    setPathname("/");
    render(<NavLinks />);
    const home = screen.getByText("Home");
    expect(home.getAttribute("data-active")).toBe("true");
    expect(home.getAttribute("aria-current")).toBe("page");
  });

  it("does NOT mark Home active on /browse (root-only match)", () => {
    setPathname("/browse");
    render(<NavLinks />);
    const home = screen.getByText("Home");
    expect(home.getAttribute("data-active")).toBeNull();
  });

  it("marks Extract active on /extract", () => {
    setPathname("/extract");
    render(<NavLinks />);
    const extract = screen.getByText("Extract");
    expect(extract.getAttribute("data-active")).toBe("true");
    expect(extract.getAttribute("aria-current")).toBe("page");
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
