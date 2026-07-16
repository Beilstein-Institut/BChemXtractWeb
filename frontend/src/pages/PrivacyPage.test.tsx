import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PrivacyPage } from "./PrivacyPage";

describe("PrivacyPage", () => {
  it("exposes the privacy-page root data-slot", () => {
    const { container } = render(<PrivacyPage />);
    expect(container.querySelector('[data-slot="privacy-page"]')).not.toBeNull();
  });

  it("renders every § section with an anchor target", () => {
    const { container } = render(<PrivacyPage />);
    const topicIds = [
      "collection",
      "website-visit",
      "extractions",
      "cookies",
      "analytics",
      "rights",
      "objection",
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
      '[data-slot="privacy-collection"]',
    ) as HTMLElement | null;
    expect(section).not.toBeNull();
    const text = section!.textContent ?? "";
    expect(text).toMatch(/Beilstein-Institut zur Förderung der Chemischen Wissenschaften/);
    expect(text).toMatch(/datenschutz@beilstein-institut\.de/);
    // § 1(3) legal basis intentionally follows the institute's official
    // document (Art. 6(1) lit. c, not lit. f) — regression guard so it can't
    // silently flip back.
    expect(text).toMatch(/Art\. 6 \(1\) lit\. c GDPR/);
  });

  it("discloses that uploads are persisted and can be deleted from History or Settings", () => {
    const { container } = render(<PrivacyPage />);
    const section = container.querySelector(
      '[data-slot="privacy-extractions"]',
    ) as HTMLElement | null;
    expect(section).not.toBeNull();
    expect(section!.textContent).toMatch(/PostgreSQL/);
    expect(section!.textContent).toMatch(/InChIKey/);
    // Internal links so users can act on their erasure right.
    expect(section!.querySelector('a[href="/history"]')).not.toBeNull();
    expect(section!.querySelector('a[href="/settings"]')).not.toBeNull();
  });

  it("discloses the audit log with its 12-month retention", () => {
    const { container } = render(<PrivacyPage />);
    const section = container.querySelector(
      '[data-slot="privacy-extractions"]',
    ) as HTMLElement | null;
    expect(section).not.toBeNull();
    const text = section!.textContent ?? "";
    expect(text).toMatch(/audit log/i);
    expect(text).toMatch(/IP address/);
    expect(text).toMatch(/12 months/);
  });

  it("discloses the bcx_sid session cookie in a table plus browser storage", () => {
    const { container } = render(<PrivacyPage />);
    const section = container.querySelector('[data-slot="privacy-cookies"]') as HTMLElement | null;
    expect(section).not.toBeNull();
    const text = section!.textContent ?? "";
    expect(text).toMatch(/bcx_sid/);
    expect(text).toMatch(/30 days/);
    expect(text).toMatch(/bchemxtract-theme/);
    expect(text).toMatch(/bcx\.reactions\.experimentalBannerDismissed/);
    expect(section!.querySelector('[data-slot="privacy-cookie-table"]')).not.toBeNull();
  });

  it("states that no web analytics are used", () => {
    const { container } = render(<PrivacyPage />);
    const section = container.querySelector(
      '[data-slot="privacy-analytics"]',
    ) as HTMLElement | null;
    expect(section).not.toBeNull();
    expect(section!.textContent).toMatch(/does not use any web-analytics service/i);
  });

  it("states the competent supervisory authority", () => {
    render(<PrivacyPage />);
    const section = document.querySelector('[data-slot="privacy-rights"]') as HTMLElement | null;
    expect(section).not.toBeNull();
    expect(section!.textContent).toMatch(/Hessian Commissioner for Data Protection/i);
    expect(section!.textContent).toMatch(/Wiesbaden/);
  });

  it("renders a version date", () => {
    const { container } = render(<PrivacyPage />);
    const version = container.querySelector('[data-slot="privacy-version"]') as HTMLElement | null;
    expect(version).not.toBeNull();
    // Literal value, not just shape — the version tracks the source document
    // and a wrong date should fail the test.
    expect(version!.textContent).toMatch(/Version 07\.07\.2026/);
  });

  it("links to the Beilstein-Institut full privacy policy", () => {
    render(<PrivacyPage />);
    const link = screen.getByRole("link", {
      name: /full privacy policy/i,
    });
    expect(link).toHaveAttribute("href", "https://www.beilstein-institut.de/en/privacy-policy/");
  });
});
