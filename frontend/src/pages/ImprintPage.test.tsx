import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ImprintPage } from "./ImprintPage";

describe("ImprintPage", () => {
  it("exposes the imprint-page root data-slot", () => {
    const { container } = render(<ImprintPage />);
    expect(container.querySelector('[data-slot="imprint-page"]')).not.toBeNull();
  });

  it("identifies the operating entity and its legal form", () => {
    const { container } = render(<ImprintPage />);
    const section = container.querySelector(
      '[data-slot="imprint-entity"]',
    ) as HTMLElement | null;
    expect(section).not.toBeNull();
    const text = section!.textContent ?? "";
    expect(text).toMatch(
      /Beilstein-Institut zur Förderung der Chemischen Wissenschaften/,
    );
    expect(text).toMatch(/Stiftung/i);
    expect(text).toMatch(/Trakehner Stra.+7.+9/);
    expect(text).toMatch(/60487 Frankfurt am Main/);
    expect(text).toMatch(/\+49 \(0\) 69 71673-20/);
  });

  it("names the content officer under §18 (2) MStV", () => {
    const { container } = render(<ImprintPage />);
    const governance = container.querySelector(
      '[data-slot="imprint-governance"]',
    ) as HTMLElement | null;
    expect(governance).not.toBeNull();
    const text = governance!.textContent ?? "";
    expect(text).toMatch(/§\s*18.*MStV/);
    expect(text).toMatch(/Wendy Patterson/);
  });

  it("provides a working mailto for the operator", () => {
    render(<ImprintPage />);
    const mail = screen.getByRole("link", {
      name: /info@beilstein-institut\.de/i,
    });
    expect(mail).toHaveAttribute("href", "mailto:info@beilstein-institut.de");
  });

  it("attributes the imprint to its authoritative source", () => {
    render(<ImprintPage />);
    const attribution = screen.getByRole("link", {
      name: /beilstein-institut\.de\/en\/impressum/i,
    });
    expect(attribution).toHaveAttribute(
      "href",
      "https://www.beilstein-institut.de/en/impressum/",
    );
    expect(attribution).toHaveAttribute("target", "_blank");
    expect(attribution).toHaveAttribute("rel", "noreferrer");
  });
});
