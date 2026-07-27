import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LimitationsPage } from "./LimitationsPage";

/** Detail sections, in the order the "at a glance" table lists them. */
const DETAIL_IDS = [
  "reactions",
  "cdxml-fidelity",
  "large-structures",
  "stereo",
  "markush",
  "untrusted-input",
  "configurability",
  "test-coverage",
];

describe("LimitationsPage", () => {
  it("exposes the limitations-page root data-slot", () => {
    const { container } = render(<LimitationsPage />);
    expect(container.querySelector('[data-slot="limitations-page"]')).not.toBeNull();
  });

  it("renders every detail section with header-clearing scroll offset", () => {
    const { container } = render(<LimitationsPage />);
    for (const id of DETAIL_IDS) {
      const section = container.querySelector(`[data-slot="limitation-${id}"]`);
      expect(section, `missing section: ${id}`).not.toBeNull();
      expect(section!.id).toBe(id);
      // Anchor jumps must land below the sticky header.
      expect(section!.className).toMatch(/scroll-mt-/);
    }
  });

  it("uses the glance table as the table of contents", () => {
    const { container } = render(<LimitationsPage />);
    const rows = container.querySelectorAll('[data-slot="limitations-glance-table"] tbody tr');
    expect(rows).toHaveLength(DETAIL_IDS.length);

    // Every row number links to a section that actually exists on the page.
    rows.forEach((row, i) => {
      const anchor = row.querySelector("a");
      expect(anchor, `row ${i + 1} has no anchor`).not.toBeNull();
      expect(anchor!.textContent).toBe(String(i + 1));
      const href = anchor!.getAttribute("href");
      expect(href).toBe(`#${DETAIL_IDS[i]}`);
      expect(container.querySelector(`#${CSS.escape(DETAIL_IDS[i])}`)).not.toBeNull();
    });
  });

  it("links back to the About page feature list", () => {
    render(<LimitationsPage />);
    expect(screen.getByRole("link", { name: /feature list on the About page/i })).toHaveAttribute(
      "href",
      "/about",
    );
  });

  it("offers both reporting channels", () => {
    render(<LimitationsPage />);
    expect(screen.getByRole("link", { name: /github issue/i })).toHaveAttribute(
      "href",
      "https://github.com/Beilstein-Institut/BChemXtract/issues/new/choose",
    );
    expect(
      screen.getByRole("link", { name: /open-source@beilstein-institut\.de/i }),
    ).toHaveAttribute("href", "mailto:open-source@beilstein-institut.de");
  });

  // The upstream LIMITATIONS doc describes the bare Java library. Two entries
  // were rewritten for this deployment; these guards keep a future copy-paste
  // from silently reintroducing the upstream (wrong-here) claims.
  it("states this app's own 100-heavy-atom InChI cutoff, not the library's 500", () => {
    const { container } = render(<LimitationsPage />);
    const section = container.querySelector('[data-slot="limitation-large-structures"]');
    const text = section!.textContent ?? "";
    expect(text).toMatch(/100 heavy \(non-hydrogen\) atoms/);
    expect(text).toMatch(/PubChem enrichment is unavailable/);
    // 500 may only appear as the library's secondary cap, never as *the* limit.
    expect(text).not.toMatch(/above 500 atoms/i);
    expect(text).not.toMatch(/> ?500 atoms/);
  });

  it("describes CDXML uploads as entity-screened rather than unguarded", () => {
    const { container } = render(<LimitationsPage />);
    const section = container.querySelector('[data-slot="limitation-untrusted-input"]');
    const text = section!.textContent ?? "";
    expect(text).toMatch(/screened before it is parsed/);
    expect(text).toMatch(/415/);
    expect(text).not.toMatch(/XXE not explicitly disabled/i);
  });
});
