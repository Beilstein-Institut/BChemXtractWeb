import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TermsPage } from "./TermsPage";

describe("TermsPage", () => {
  it("exposes the terms-page root data-slot", () => {
    const { container } = render(<TermsPage />);
    expect(container.querySelector('[data-slot="terms-page"]')).not.toBeNull();
  });

  it("renders the terms and conditions ahead of the license sections", () => {
    const { container } = render(<TermsPage />);
    const terms = container.querySelector('[data-slot="terms-conditions"]');
    const mit = container.querySelector('[data-slot="license-mit"]');
    expect(terms).not.toBeNull();
    expect(mit).not.toBeNull();
    // Terms must precede the MIT notice in document order.
    expect(terms!.compareDocumentPosition(mit!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("covers the load-bearing clauses adapted from the Beilstein terms", () => {
    const { container } = render(<TermsPage />);
    const list = container.querySelector(
      '[data-slot="terms-conditions-list"]',
    ) as HTMLElement | null;
    expect(list).not.toBeNull();
    expect(list!.querySelectorAll(":scope > li").length).toBe(8);
    const text = list!.textContent ?? "";
    expect(text).toMatch(/No registration is required/);
    expect(text).toMatch(/provided for use .as is./);
    expect(text).toMatch(/Privacy Policy/);
    expect(text).toMatch(/Federal Republic of Germany/);
    expect(text).toMatch(/Frankfurt am Main/);
  });

  it("links the privacy clause to the internal privacy page", () => {
    render(<TermsPage />);
    const privacyLink = screen.getByRole("link", { name: /Privacy Policy/i });
    expect(privacyLink).toHaveAttribute("href", "/privacy");
  });

  it("renders the MIT license section with the verbatim notice", () => {
    const { container } = render(<TermsPage />);
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
    const { container } = render(<TermsPage />);
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
    const { container } = render(<TermsPage />);
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
    render(<TermsPage />);
    const licenseLink = screen.getByRole("link", {
      name: /LICENSE file at the repository root/i,
    });
    expect(licenseLink).toHaveAttribute(
      "href",
      "https://github.com/Beilstein-Institut/BChemXtractWeb/blob/main/LICENSE",
    );
  });
});
