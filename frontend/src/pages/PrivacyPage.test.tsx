import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PrivacyPage } from "./PrivacyPage";

describe("PrivacyPage", () => {
  it("exposes the privacy-page root data-slot", () => {
    const { container } = render(<PrivacyPage />);
    expect(container.querySelector('[data-slot="privacy-page"]')).not.toBeNull();
  });

  it("renders every topic section with an anchor target", () => {
    const { container } = render(<PrivacyPage />);
    const topicIds = [
      "controller",
      "uploads",
      "logs",
      "client-storage",
      "third-parties",
      "rights",
      "supervisory-authority",
    ];
    for (const id of topicIds) {
      const section = container.querySelector(`#${id}`);
      expect(section, `missing section #${id}`).not.toBeNull();
      // Scroll offset keeps the sticky header from covering the heading.
      expect(section!.className).toContain("scroll-mt-");
    }
  });

  it("names the controller and the data protection officer", () => {
    render(<PrivacyPage />);
    const section = document.querySelector(
      '[data-slot="privacy-controller"]',
    ) as HTMLElement | null;
    expect(section).not.toBeNull();
    const text = section!.textContent ?? "";
    expect(text).toMatch(/Beilstein-Institut zur Förderung der Chemischen Wissenschaften/);
    expect(text).toMatch(/datenschutz@beilstein-institut\.de/);
  });

  it("discloses that uploads are persisted and can be deleted from History", () => {
    const { container } = render(<PrivacyPage />);
    const section = container.querySelector('[data-slot="privacy-uploads"]') as HTMLElement | null;
    expect(section).not.toBeNull();
    expect(section!.textContent).toMatch(/PostgreSQL/);
    expect(section!.textContent).toMatch(/InChIKey/);
    // Internal Link to the History page so users can act on their erasure right.
    const historyLink = section!.querySelector('a[href="/history"]') as HTMLAnchorElement | null;
    expect(historyLink).not.toBeNull();
  });

  it("discloses browser storage and confirms no cookies", () => {
    const { container } = render(<PrivacyPage />);
    const section = container.querySelector(
      '[data-slot="privacy-client-storage"]',
    ) as HTMLElement | null;
    expect(section).not.toBeNull();
    const text = section!.textContent ?? "";
    expect(text).toMatch(/no cookies/i);
    expect(text).toMatch(/bchemxtract-theme/);
    expect(text).toMatch(/bcx\.reactions\.experimentalBannerDismissed/);
  });

  it("states the competent supervisory authority", () => {
    render(<PrivacyPage />);
    const section = document.querySelector(
      '[data-slot="privacy-supervisory-authority"]',
    ) as HTMLElement | null;
    expect(section).not.toBeNull();
    expect(section!.textContent).toMatch(/Hessian Commissioner for Data Protection/i);
    expect(section!.textContent).toMatch(/Wiesbaden/);
  });

  it("links to the Beilstein-Institut full privacy policy", () => {
    render(<PrivacyPage />);
    const link = screen.getByRole("link", {
      name: /full privacy policy/i,
    });
    expect(link).toHaveAttribute("href", "https://www.beilstein-institut.de/en/privacy-policy/");
  });
});
