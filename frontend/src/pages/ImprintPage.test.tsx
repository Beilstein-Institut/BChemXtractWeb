import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ImprintPage } from "./ImprintPage";

describe("ImprintPage", () => {
  it("exposes the imprint-page root data-slot", () => {
    const { container } = render(<ImprintPage />);
    expect(container.querySelector('[data-slot="imprint-page"]')).not.toBeNull();
  });

  it("identifies the operating entity", () => {
    const { container } = render(<ImprintPage />);
    const section = container.querySelector('[data-slot="imprint-entity"]') as HTMLElement | null;
    expect(section).not.toBeNull();
    const text = section!.textContent ?? "";
    expect(text).toMatch(/Beilstein-Institut zur Förderung der Chemischen Wissenschaften/);
    expect(text).toMatch(/Trakehner Str\. 7-9/);
    expect(text).toMatch(/60487 Frankfurt am Main/);
    // Contact numbers are grouped exactly as in the institute's Impressum.
    expect(text).toMatch(/\+49 69 716732-0/);
    expect(text).toMatch(/\+49 69 716732-19/);
    expect(text).toMatch(/foundation established under civil law/);
    expect(text).toMatch(/Olaf Beckmann-Haag, Dr\. Wendy Patterson/);
    expect(text).toMatch(/\(AZ\): III 21-25d 04\/11-\(12\)-22/);
  });

  it("shows the institute logo", () => {
    render(<ImprintPage />);
    expect(screen.getByAltText("Beilstein-Institut")).toHaveAttribute(
      "src",
      "/beilstein-institut-logo.png",
    );
  });

  it("omits the media-treaty content officer and VAT ID (not applicable)", () => {
    const { container } = render(<ImprintPage />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/MStV/);
    expect(text).not.toMatch(/MDStV/);
    expect(text).not.toMatch(/DE 114234743/);
    expect(text).not.toMatch(/VAT ID/i);
  });

  it("renders the copyright notice", () => {
    const { container } = render(<ImprintPage />);
    const copyright = container.querySelector(
      '[data-slot="imprint-copyright"]',
    ) as HTMLElement | null;
    expect(copyright).not.toBeNull();
    expect(copyright!.textContent).toMatch(
      /Copyright © 2026 Beilstein-Institut zur Förderung der Chemischen Wissenschaften/,
    );
  });

  it("provides a working mailto for the operator", () => {
    render(<ImprintPage />);
    const mail = screen.getByRole("link", {
      name: /info@beilstein-institut\.de/i,
    });
    expect(mail).toHaveAttribute("href", "mailto:info@beilstein-institut.de");
  });
});
