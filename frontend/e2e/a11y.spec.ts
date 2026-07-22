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
  { path: "/license", label: "License" },
  { path: "/imprint", label: "Imprint" },
  { path: "/privacy", label: "Privacy" },
];

test.describe("a11y — axe-core sweep", () => {
  for (const { path, label } of ROUTES) {
    test(`${label} (${path}) has no serious or critical violations`, async ({ page }) => {
      await page.goto(path);
      // Let any lazy content + fonts settle before running axe.
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const severe = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );

      if (severe.length > 0) {
        const summary = severe
          .map(
            (v) =>
              `${v.id} [${v.impact}] — ${v.help}\n    ${v.helpUrl}\n    ${v.nodes.length} node(s)`,
          )
          .join("\n  ");
        throw new Error(
          `Axe found ${severe.length} serious/critical violation(s) on ${path}:\n  ${summary}`,
        );
      }

      expect(severe).toEqual([]);
    });
  }
});
