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
    // Five sections, in the order of the institute's source document.
    const topicIds = ["collection", "website-visit", "cookies", "rights", "objection"];
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
    // 60487, as on the Impressum — the source document's 60486 is a typo.
    expect(text).toMatch(/60487 Frankfurt am Main/);
    // § 1(3) legal basis intentionally follows the institute's official
    // document (Art. 6(1) lit. c, not lit. f) — regression guard so it can't
    // silently flip back.
    expect(text).toMatch(/Art\. 6 \(1\) lit\. c GDPR/);
  });

  it("discloses that uploads are persisted and can be deleted from History or Settings", () => {
    const { container } = render(<PrivacyPage />);
    const section = container.querySelector('[data-slot="privacy-cookies"]') as HTMLElement | null;
    expect(section).not.toBeNull();
    expect(section!.textContent).toMatch(/PostgreSQL/);
    expect(section!.textContent).toMatch(/InChIKey/);
    // Internal links so users can act on their erasure right.
    expect(section!.querySelector('a[href="/history"]')).not.toBeNull();
    expect(section!.querySelector('a[href="/settings"]')).not.toBeNull();
  });

  it("discloses the audit log with its 12-month retention", () => {
    const { container } = render(<PrivacyPage />);
    const section = container.querySelector('[data-slot="privacy-cookies"]') as HTMLElement | null;
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

  // The institute's source document says "We do not use Cookies or similar
  // technical aids" — untrue of this app, which sets bcx_sid. § 3 must never
  // regress to that claim.
  it("does not claim to be cookie-free", () => {
    const { container } = render(<PrivacyPage />);
    const section = container.querySelector('[data-slot="privacy-cookies"]') as HTMLElement | null;
    expect(section).not.toBeNull();
    expect(section!.textContent).not.toMatch(/do not use Cookies/i);
  });

  it("links the institute logo to the institute website", () => {
    render(<PrivacyPage />);
    const logo = screen.getByAltText("Beilstein-Institut");
    expect(logo).toHaveAttribute("src", "/beilstein-institut-logo-wide.png");
    expect(logo.closest("a")).toHaveAttribute("href", "https://www.beilstein-institut.de/en/");
  });

  // The rights holder asked for its text verbatim, with nothing added. This
  // sentence is the one exception in § 2: we cannot warrant the document's
  // "delete them within 2 weeks" because the logs rotate by size instead.
  it("describes how the access logs really behave", () => {
    const { container } = render(<PrivacyPage />);
    const section = container.querySelector(
      '[data-slot="privacy-website-visit"]',
    ) as HTMLElement | null;
    expect(section).not.toBeNull();
    expect(section!.textContent).toMatch(/size-capped and rotate automatically/i);
  });

  it("states the competent supervisory authority", () => {
    render(<PrivacyPage />);
    const section = document.querySelector('[data-slot="privacy-rights"]') as HTMLElement | null;
    expect(section).not.toBeNull();
    expect(section!.textContent).toMatch(/Hessian Commissioner for Data Protection/i);
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
