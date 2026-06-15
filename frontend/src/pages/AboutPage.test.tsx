/**
 * AboutPage tests.
 *
 * Covers:
 *   - Root + every tile expose their `data-slot` hook.
 *   - Hero tile renders mission copy + "Start extracting" link + GitHub CTA.
 *   - Version tile shows the package.json version (__APP_VERSION__ define)
 *     and the BChemXtract engine version when the env var is baked in.
 *   - Links tile renders BChemXtractWeb / BChemXtract (upstream) / CDK as
 *     outbound anchors with `target="_blank" rel="noreferrer"`.
 *   - Tech-stack tile renders a Badge chip per declared technology.
 *   - Credits tile links to the Beilstein-Institut.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { AboutPage } from "./AboutPage";

describe("AboutPage", () => {
  it("exposes the `about-page` root data-slot", () => {
    const { container } = render(<AboutPage />);
    expect(container.querySelector('[data-slot="about-page"]')).not.toBeNull();
  });

  it("renders every tile slot inside the bento", () => {
    const { container } = render(<AboutPage />);
    const slots = [
      "about-bento",
      "about-hero-cell",
      "about-version-cell",
      "about-links-cell",
      "about-tech-cell",
      "about-credits-cell",
      "about-hero",
      "about-version",
      "about-links",
      "about-tech-stack",
      "about-credits",
    ];
    for (const slot of slots) {
      expect(
        container.querySelector(`[data-slot="${slot}"]`),
        `missing [data-slot="${slot}"]`,
      ).not.toBeNull();
    }
  });

  it("renders hero mission copy and CTA links", () => {
    render(<AboutPage />);
    // Mission blurb mentions InChI / SMILES to anchor on extractable copy.
    expect(screen.getByText(/InChI, SMILES, RInChI/i)).toBeInTheDocument();
    // "Start extracting" routes to "/" via the internal Link.
    const start = screen.getByRole("link", { name: /start extracting/i });
    expect(start).toHaveAttribute("href", "/");
    // GitHub CTA now points at the web wrapper repo (not the upstream Java lib).
    const github = screen.getByRole("link", { name: /view on github/i });
    expect(github).toHaveAttribute("href", "https://github.com/Beilstein-Institut/BChemXtractWeb");
    expect(github).toHaveAttribute("target", "_blank");
    expect(github).toHaveAttribute("rel", "noreferrer");
  });

  describe("version tile", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("shows the app version stamped from package.json", () => {
      const { container } = render(<AboutPage />);
      const valueEl = container.querySelector('[data-slot="about-version-value"]');
      expect(valueEl).not.toBeNull();
      // __APP_VERSION__ is injected by the define block in vite.config.ts,
      // which vitest shares — the tile must show exactly that value.
      expect(valueEl?.textContent).toBe(__APP_VERSION__);
      expect(valueEl?.textContent).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("shows the engine version when VITE_BCHEMXTRACT_VERSION is set", () => {
      vi.stubEnv("VITE_BCHEMXTRACT_VERSION", "v1.1.1");
      const { container } = render(<AboutPage />);
      const engine = container.querySelector('[data-slot="about-engine-version"]');
      expect(engine).not.toBeNull();
      expect(engine?.textContent).toBe("BChemXtract v1.1.1");
    });

    it("omits the engine line when VITE_BCHEMXTRACT_VERSION is unset", () => {
      vi.stubEnv("VITE_BCHEMXTRACT_VERSION", "");
      const { container } = render(<AboutPage />);
      expect(container.querySelector('[data-slot="about-engine-version"]')).toBeNull();
    });
  });

  it("renders the resources list with outbound links only", () => {
    const { container } = render(<AboutPage />);
    const list = container.querySelector('[data-slot="about-links-list"]');
    expect(list).not.toBeNull();
    const anchors = list!.querySelectorAll("a");
    // BChemXtractWeb repo, upstream BChemXtract, and CDK.
    expect(anchors.length).toBeGreaterThanOrEqual(3);
    for (const anchor of anchors) {
      expect(anchor.getAttribute("target")).toBe("_blank");
      expect(anchor.getAttribute("rel")).toBe("noreferrer");
      expect(anchor.getAttribute("href")).toMatch(/^https?:\/\//);
    }
    // Spot-check the three known destinations show up as labels.
    expect(screen.getByText(/BChemXtractWeb on GitHub/i)).toBeInTheDocument();
    expect(screen.getByText("BChemXtract on GitHub")).toBeInTheDocument();
    expect(screen.getByText("Chemistry Development Kit")).toBeInTheDocument();
    // Confirm the removed PubChem / RDKit entries are gone.
    expect(screen.queryByText("PubChem")).toBeNull();
    expect(screen.queryByText("RDKit")).toBeNull();
  });

  it("renders the tech-stack tile as Badge chips", () => {
    const { container } = render(<AboutPage />);
    const list = container.querySelector('[data-slot="about-tech-list"]');
    expect(list).not.toBeNull();
    const chips = list!.querySelectorAll('[data-slot="badge"]');
    // The declared stack has 6 entries (React 19, Tailwind v4, Vite,
    // FastAPI, JPype, CDK 2.12). Guard on presence + minimum count.
    expect(chips.length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText("React 19")).toBeInTheDocument();
    expect(screen.getByText("FastAPI")).toBeInTheDocument();
    expect(screen.getByText("JPype")).toBeInTheDocument();
    expect(screen.getByText("CDK 2.12")).toBeInTheDocument();
  });

  describe("delight touches", () => {
    it("logs the API-builder console note once per session", async () => {
      // Fresh module registry so the module-level once-guard resets —
      // earlier tests in this file have already rendered AboutPage.
      vi.resetModules();
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      const { AboutPage: FreshAboutPage } = await import("./AboutPage");
      render(<FreshAboutPage />);
      render(<FreshAboutPage />);
      const apiNotes = info.mock.calls.filter((call) => String(call[0]).includes("REST API"));
      expect(apiNotes.length).toBe(1);
      info.mockRestore();
    });
  });

  it("renders the credits tile with a Beilstein-Institut link", () => {
    render(<AboutPage />);
    const institute = screen.getAllByRole("link", {
      name: /beilstein-institut/i,
    });
    expect(institute.length).toBeGreaterThanOrEqual(1);
    // Every Beilstein-Institut link should open externally.
    for (const link of institute) {
      expect(link.getAttribute("href")).toBe("https://www.beilstein-institut.de/");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noreferrer");
    }
  });
});
