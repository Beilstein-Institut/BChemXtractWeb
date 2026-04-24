/**
 * Smoke tests for the Clan Pro font scaffold.
 *
 * We can't meaningfully test webfont loading in jsdom (no paint, no
 * network, no font loader). What we CAN test:
 *
 *   1. The scaffold file exists at the expected path.
 *   2. It declares the three expected weights (400/500/700).
 *   3. The `src:` stack follows the local-first-then-url ordering.
 *   4. `font-display: swap` is set on every declaration — without it,
 *      the wordmark would FOIT while Clan Pro loads.
 *
 * These guard against accidental regressions to the scaffold during
 * future CSS refactors. When the commercial files finally land and
 * clan-pro.css is imported from fonts.css, existing integration tests
 * will exercise the visual outcome.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS_PATH = join(__dirname, "clan-pro.css");
const CSS_SOURCE = readFileSync(CSS_PATH, "utf-8");

describe("clan-pro.css scaffold", () => {
  it("declares @font-face rules for 400/500/700 weights", () => {
    const matches = CSS_SOURCE.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(matches).toHaveLength(3);

    const weights = matches.map((block) => block.match(/font-weight:\s*(\d+)/)?.[1]).sort();
    expect(weights).toEqual(["400", "500", "700"]);
  });

  it("every declaration sets font-display: swap (no FOIT)", () => {
    const matches = CSS_SOURCE.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    for (const block of matches) {
      expect(block).toMatch(/font-display:\s*swap/);
    }
  });

  it("src stack is local-first, url-last in every declaration", () => {
    const matches = CSS_SOURCE.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    for (const block of matches) {
      const srcMatch = block.match(/src:\s*([^;]+);/);
      expect(srcMatch).not.toBeNull();
      const srcBody = srcMatch![1];
      const firstLocal = srcBody.indexOf("local(");
      const firstUrl = srcBody.indexOf("url(");
      expect(firstLocal).toBeGreaterThanOrEqual(0);
      expect(firstUrl).toBeGreaterThan(firstLocal);
    }
  });

  it("url() references point under /fonts/clan-pro/", () => {
    const urls = CSS_SOURCE.match(/url\("[^"]+"\)/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^url\("\/fonts\/clan-pro\/[^"]+\.woff2"\)$/);
    }
  });
});
