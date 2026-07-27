/**
 * Accessibility smoke — axe-core sweep of every top-level route.
 *
 * Asserts zero serious or critical violations on each page. Runs in the
 * same Playwright pipeline as the smoke suite so the a11y gate ships with
 * every build. Lower-severity findings surface in the assertion message
 * but do not fail the suite; severe violations block the commit.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES: ReadonlyArray<{ path: string; label: string }> = [
  { path: "/", label: "Home" },
  { path: "/extract", label: "Extract" },
  { path: "/browse", label: "Browse" },
  { path: "/history", label: "History" },
  { path: "/about", label: "About" },
  { path: "/limitations", label: "Limitations" },
  { path: "/license", label: "License" },
  { path: "/imprint", label: "Imprint" },
  { path: "/privacy", label: "Privacy" },
];

/**
 * Both themes are swept. The palette is class-driven — public/theme-init.js
 * stamps `.dark`/`.light` on <html> from this same storage key before first
 * paint — and the two themes use different colour pairings, so a contrast
 * regression can exist in one and not the other. A light-only sweep missed
 * that dark-mode accents failed AA as text while white-on-accent fills failed
 * as labels; both are now asserted here.
 */
const THEMES = ["light", "dark"] as const;

test.describe("a11y — axe-core sweep", () => {
  for (const theme of THEMES) {
    for (const { path, label } of ROUTES) {
      test(`${label} (${path}) has no serious or critical violations in ${theme} mode`, async ({
        page,
      }) => {
        await page.addInitScript((t) => {
          localStorage.setItem("bchemxtract-theme", t);
        }, theme);
        await page.goto(path);
        // Let any lazy content + fonts settle before running axe.
        await page.waitForLoadState("networkidle");
        // Guard the guard: if the theme did not actually apply, the sweep below
        // would silently re-test light mode twice.
        await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();

        const severe = results.violations.filter(
          (v) => v.impact === "serious" || v.impact === "critical",
        );

        if (severe.length > 0) {
          // Include each node's failure summary — for colour-contrast that
          // carries the measured ratio and the two colours, which is what you
          // need to fix it without re-running axe by hand.
          const summary = severe
            .map((v) => {
              const nodes = v.nodes.map(
                (n) => `${n.target.join(" ")} :: ${n.failureSummary?.replaceAll("\n", " ")}`,
              );
              return `${v.id} [${v.impact}] — ${v.help}\n    ${v.helpUrl}\n    ${nodes.join("\n    ")}`;
            })
            .join("\n  ");
          throw new Error(
            `Axe found ${severe.length} serious/critical violation(s) on ${path} (${theme}):\n  ${summary}`,
          );
        }

        expect(severe).toEqual([]);
      });
    }
  }
});
