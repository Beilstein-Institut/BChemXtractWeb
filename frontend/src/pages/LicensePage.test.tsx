import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LicensePage } from "./LicensePage";

describe("LicensePage", () => {
  it("exposes the license-page root data-slot", () => {
    const { container } = render(<LicensePage />);
    expect(container.querySelector('[data-slot="license-page"]')).not.toBeNull();
  });

  it("renders the MIT license section with the verbatim notice", () => {
    const { container } = render(<LicensePage />);
    const section = container.querySelector('[data-slot="license-mit"]');
    expect(section).not.toBeNull();
    const preEl = container.querySelector('[data-slot="license-mit-text"]') as HTMLElement | null;
    expect(preEl).not.toBeNull();
    const text = preEl!.textContent ?? "";
    // Spot-check the load-bearing clauses that must reach the reader.
    expect(text).toMatch(/MIT License/);
    expect(text).toMatch(
      /Copyright \(c\) 2026 Beilstein Institute for the Advancement of Chemical Sciences/,
    );
    expect(text).toMatch(/Permission is hereby granted, free of charge/);
    expect(text).toMatch(/WITHOUT WARRANTY OF ANY KIND/);
  });

  it("renders a third-party components list with outbound links only", () => {
    const { container } = render(<LicensePage />);
    const list = container.querySelector('[data-slot="license-third-party-list"]');
    expect(list).not.toBeNull();
    const anchors = list!.querySelectorAll("a");
    expect(anchors.length).toBeGreaterThanOrEqual(5);
    for (const anchor of anchors) {
      expect(anchor.getAttribute("href")).toMatch(/^https?:\/\//);
      expect(anchor.getAttribute("target")).toBe("_blank");
      expect(anchor.getAttribute("rel")).toBe("noreferrer");
    }
  });

  it("names CDK and declares its LGPL license in its own notice", () => {
    const { container } = render(<LicensePage />);
    const notice = container.querySelector(
      '[data-slot="license-cdk-notice"]',
    ) as HTMLElement | null;
    expect(notice).not.toBeNull();
    const text = notice!.textContent ?? "";
    expect(text).toMatch(/Chemistry Development Kit/i);
    expect(text).toMatch(/LGPL|Lesser General Public License/i);
    // The "source is available" language is a GPL-family compliance cue.
    expect(text).toMatch(/source/i);
  });

  it("links to the BChemXtractWeb LICENSE file upstream", () => {
    render(<LicensePage />);
    const licenseLink = screen.getByRole("link", {
      name: /LICENSE file at the repository root/i,
    });
    expect(licenseLink).toHaveAttribute(
      "href",
      "https://github.com/Beilstein-Institut/BChemXtractWeb/blob/main/LICENSE",
    );
  });
});
