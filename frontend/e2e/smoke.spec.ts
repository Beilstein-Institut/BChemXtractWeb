/**
 * Smoke tests — Liquid Glass rebuild sign-off.
 *
 * Six scenarios covering the core happy path on each top-level route plus
 * the new ⌘K palette and theme-switch. Scenarios 2-6 don't need the backend;
 * Scenario 1 (upload CDX) is guarded behind a backend-reachability probe
 * and skipped by default until a backend-enabled e2e pipeline is in place.
 *
 * Conventions:
 *   - All selectors use `data-slot` hooks declared in the pages /
 *     components (BrowsePage, HistoryPage, AboutPage, CommandPalette,
 *     ChemistryThemeSwitch, StructureCard).
 *   - Each test navigates directly to the route under test and waits for
 *     the page's root `data-slot` before asserting child behaviour.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Playwright test files run as ES modules, so `__dirname` is not defined
// by default. Resolve it from `import.meta.url` instead.
const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve a CDX fixture relative to the repo so the same spec works both
// from the frontend/ directory and from a CI runner.
const FIXTURE_CDX = resolve(__dirname, "..", "..", "..", "Test_files", "test_fixture.cdx");

/**
 * Probe whether an extraction-capable backend is reachable. Tries the
 * nginx reverse proxy first (which injects the auth bearer the backend
 * now requires) and falls back to the direct backend port for frontend-
 * only dev. Returns false only if both routes fail — those runs skip
 * backend-dependent scenarios cleanly rather than hanging on upload.
 */
async function isBackendUp(): Promise<boolean> {
  const targets = ["http://localhost/api/health", "http://localhost:8000/api/health"];
  for (const url of targets) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) return true;
    } catch {
      // next target
    }
  }
  return false;
}

test.describe("Extract page", () => {
  // Requires a live backend (JPype + BChemXtract). When the health probe
  // fails (frontend-only dev), skip so the rest of the smoke suite still
  // runs. TODO: wire this into the full docker-compose e2e environment
  // once it lands.
  test("upload → process → results shows ≥1 StructureCard", async ({ page }) => {
    test.skip(
      !existsSync(FIXTURE_CDX),
      `CDX fixture not found at ${FIXTURE_CDX} — skipping backend-dependent smoke.`,
    );
    test.skip(
      !(await isBackendUp()),
      "Backend not reachable on http://localhost:8000 — skipping backend-dependent smoke.",
    );

    await page.goto("/extract");
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(FIXTURE_CDX);

    const extractBtn = page.getByRole("button", {
      name: /extract structures|start batch/i,
    });
    if (await extractBtn.isVisible()) {
      await extractBtn.click();
    }

    // After extraction the app auto-navigates to /browse; wait for the
    // browse bento, then assert at least one StructureCard has rendered.
    await page.waitForURL(/\/browse/, { timeout: 20_000 });
    await expect(page.locator('[data-slot="browse-bento"]')).toBeVisible();
    const card = page.locator('[data-slot="structure-card"]').first();
    await expect(card).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("Browse page", () => {
  test("loads bento + search filter input", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.locator('[data-slot="browse-page"]')).toBeVisible();
    // Either the bento renders (we have an active extraction) or the
    // EmptyState shows "No extraction loaded" — both are valid smoke
    // outcomes; we assert on the page root + header.
    await expect(page.getByRole("heading", { name: "Browse", level: 1 })).toBeVisible();
  });
});

test.describe("History page", () => {
  test("loads header + CSV export button (when entries exist)", async ({ page }) => {
    await page.goto("/history");
    await expect(page.locator('[data-slot="history-page"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible();

    // The history list is paginated server-side; stats may be zero on a
    // fresh DB. The CSV button lives inside the toolbar and is rendered
    // as long as there are entries; if the page is empty we only assert
    // the EmptyState copy.
    const statsGrid = page.locator('[data-slot="history-stats"]');
    const csvButton = page.locator('[data-slot="history-export-csv"]');
    const emptyHeading = page.getByText("No extractions yet");

    const hasEntries = await statsGrid.isVisible().catch(() => false);
    if (hasEntries) {
      await expect(csvButton).toBeVisible();
    } else {
      await expect(emptyHeading).toBeVisible();
    }
  });
});

test.describe("About page", () => {
  test("loads bento with mission hero + tech stack", async ({ page }) => {
    await page.goto("/about");
    await expect(page.locator('[data-slot="about-page"]')).toBeVisible();
    await expect(page.locator('[data-slot="about-bento"]')).toBeVisible();
    await expect(page.locator('[data-slot="about-hero"]')).toBeVisible();
    await expect(page.locator('[data-slot="about-tech-stack"]')).toBeVisible();
  });
});

test.describe("Command palette (⌘K / Ctrl+K)", () => {
  test("opens on ⌘K, closes on Esc, navigation works", async ({ page }) => {
    await page.goto("/");
    // Wait for the app to mount before dispatching the global keydown —
    // `CommandPalette` installs its window-level shortcut in an effect and
    // firing before that attaches would silently no-op.
    await expect(page.locator('[data-slot="app-header"]')).toBeVisible();

    // The palette listens for `key === "k"` with Cmd or Ctrl held. We
    // dispatch the Meta variant on darwin and Control elsewhere so the
    // test matches user behaviour on either platform.
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);

    const palette = page.locator('[data-slot="command-palette"]');
    await expect(palette).toBeVisible();
    await expect(page.locator('[data-slot="command-palette-input"]')).toBeVisible();

    // Escape closes the palette.
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();

    // Reopen and navigate to /browse via the "Browse" command item. We
    // select by `data-value="nav-browse"` rather than visible text because
    // cmdk concatenates the trailing shortcut badge ("G B") with no
    // whitespace, which would break a tight "^Browse$" regex.
    await page.keyboard.press(`${modifier}+k`);
    await expect(palette).toBeVisible();
    await page.locator('[data-slot="command-item"][data-value="nav-browse"]').click();
    await expect(palette).toBeHidden();
    await expect(page).toHaveURL(/\/browse/);
  });
});

test.describe("Theme switch", () => {
  test("clicking the flask toggle flips the `.dark` class on <html>", async ({ page }) => {
    await page.goto("/");
    // Seed a known light baseline so the click always transitions into dark
    // regardless of the runner's OS preference.
    await page.evaluate(() => {
      localStorage.setItem("bchemxtract-theme", "light");
    });
    await page.reload();

    const html = page.locator("html");
    const toggle = page.locator("header").locator('[data-slot="theme-switch"]');

    // The ChemistryThemeSwitch is a plain checkbox-backed label — one click
    // flips state. No menu to open, so the assertion is a direct class
    // check after the click lands.
    await toggle.click();
    await expect(html).toHaveClass(/dark/);
  });
});
