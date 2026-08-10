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

  // Retention here must track AUDIT_LOG_RETENTION_DAYS (backend default 14).
  // The audit log is disclosed in § 2 (website visit), not § 3.
  it("discloses the audit log with its two-week retention", () => {
    const { container } = render(<PrivacyPage />);
    const section = container.querySelector(
      '[data-slot="privacy-website-visit"]',
    ) as HTMLElement | null;
    expect(section).not.toBeNull();
    const text = section!.textContent ?? "";
    expect(text).toMatch(/audit log/i);
    expect(text).toMatch(/IP address/);
    expect(text).toMatch(/two weeks/);
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

  // § 2 carries the institute's text plus the audit-log paragraph; an earlier
  // revision also appended log-rotation mechanics, which was removed.
  it("keeps § 2 free of log-rotation mechanics", () => {
    const { container } = render(<PrivacyPage />);
    const section = container.querySelector(
      '[data-slot="privacy-website-visit"]',
    ) as HTMLElement | null;
    expect(section).not.toBeNull();
    expect(section!.textContent).toMatch(/delete them within 2 weeks/);
    expect(section!.textContent).not.toMatch(/size-capped/i);
  });

  // The policy text starts directly under the title: no lede, no contents nav.
  it("renders no lede or table of contents", () => {
    const { container } = render(<PrivacyPage />);
    expect(container.querySelector('[data-slot="privacy-toc"]')).toBeNull();
    expect(container.textContent).not.toMatch(/How BChemXtractWeb handles personal data/);
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
});
