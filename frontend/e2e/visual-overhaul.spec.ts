import { test, expect } from "@playwright/test";

// ─────────────────────────────────────────────────────
// Visual overhaul — E2E tests
//
// Originally authored for the earlier single-page layout; surviving
// assertions were retargeted to the Liquid Glass rebuild.
// Tests of the old scroll-anchor nav / "BChemXtractWeb" hero / pill
// primary button / body-level smooth-scroll have been removed because
// those were design choices the Liquid Glass rebuild deliberately reversed.
// ─────────────────────────────────────────────────────

test.describe("AppHeader", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders sticky header with brand text", async ({ page }) => {
    const header = page.locator('header[data-slot="app-header"]');
    await expect(header).toBeVisible();

    // Sticky positioning
    await expect(header).toHaveCSS("position", "sticky");

    // Brand wordmark renders inside the Logo link.
    await expect(header.getByLabel("BChemXtract home")).toBeVisible();
  });

  test("header has glass backdrop-filter effect", async ({ page }) => {
    const header = page.locator('header[data-slot="app-header"]');
    const backdropFilter = await header.evaluate(
      (el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter,
    );
    expect(backdropFilter).toContain("blur");
  });

  test("desktop nav links are visible at 1280px width", async ({ page }) => {
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();

    await expect(nav.getByText("Extract")).toBeVisible();
    await expect(nav.getByText("Browse")).toBeVisible();
    await expect(nav.getByText("History")).toBeVisible();
    await expect(nav.getByText("About")).toBeVisible();
  });

  test("hamburger is hidden at desktop width", async ({ page }) => {
    const hamburger = page.getByLabel("Open navigation menu");
    await expect(hamburger).toBeHidden();
  });
});

test.describe("ChemistryThemeSwitch (flask slider)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("theme-switch toggle exists in header", async ({ page }) => {
    const toggle = page.locator("header").locator('[data-slot="theme-switch"]');
    await expect(toggle).toBeVisible();
  });

  test("clicking the flask toggle adds the dark class on <html>", async ({ page }) => {
    // Start from a known light baseline regardless of OS preference. The
    // ThemeProvider persists this to localStorage.bchemxtract-theme.
    await page.evaluate(() => {
      localStorage.setItem("bchemxtract-theme", "light");
    });
    await page.reload();

    const html = page.locator("html");
    const toggle = page.locator("header").locator('[data-slot="theme-switch"]');
    await toggle.click();
    await expect(html).toHaveClass(/dark/);
  });

  test("clicking the flask toggle again removes the dark class on <html>", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("bchemxtract-theme", "dark");
    });
    await page.reload();

    const html = page.locator("html");
    const toggle = page.locator("header").locator('[data-slot="theme-switch"]');
    await toggle.click();
    await expect(html).not.toHaveClass(/dark/);
  });
});

test.describe("Mobile Navigation", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("desktop nav links hidden at mobile width", async ({ page }) => {
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeHidden();
  });

  test("hamburger button visible at mobile width", async ({ page }) => {
    const hamburger = page.getByLabel("Open navigation menu");
    await expect(hamburger).toBeVisible();
  });

  test("hamburger opens sheet with nav links", async ({ page }) => {
    const hamburger = page.getByLabel("Open navigation menu");
    await hamburger.click();

    // Sheet should appear with nav links
    const mobileNav = page.locator('nav[aria-label="Mobile navigation"]');
    await expect(mobileNav).toBeVisible();

    await expect(mobileNav.getByText("Extract")).toBeVisible();
    await expect(mobileNav.getByText("Browse")).toBeVisible();
    await expect(mobileNav.getByText("History")).toBeVisible();
  });

  test("clicking a mobile nav link closes the sheet", async ({ page }) => {
    const hamburger = page.getByLabel("Open navigation menu");
    await hamburger.click();

    const mobileNav = page.locator('nav[aria-label="Mobile navigation"]');
    await expect(mobileNav).toBeVisible();

    // Click a link
    await mobileNav.getByText("Extract").click();

    // Sheet should close
    await expect(mobileNav).toBeHidden({ timeout: 3000 });
  });

  test("theme-switch visible on mobile", async ({ page }) => {
    const toggle = page.locator("header").locator('[data-slot="theme-switch"]');
    await expect(toggle).toBeVisible();
  });
});

test.describe("Typography and Spacing", () => {
  // The Extract page (hero tagline, subtitle, generous top padding) lives at
  // /extract; "/" is now the home landing.
  test.beforeEach(async ({ page }) => {
    await page.goto("/extract");
  });

  test("hero h1 renders the Extract page tagline in the display scale", async ({ page }) => {
    const h1 = page.locator("h1").filter({ hasText: /Your drawings, read back\./i });
    await expect(h1).toBeVisible();

    const fontSize = await h1.evaluate((el) => getComputedStyle(el).fontSize);
    const size = parseFloat(fontSize);
    // Liquid Glass hero: font-display + text-3xl (30px) on mobile,
    // text-4xl (36px) from sm: upward. Viewport here is 1280×720.
    expect(size).toBeGreaterThanOrEqual(30);
    expect(size).toBeLessThanOrEqual(40);
  });

  test("subtitle uses the body-base type step", async ({ page }) => {
    const subtitle = page.locator("p").filter({
      hasText: /Drop a CDX or CDXML file/i,
    });
    await expect(subtitle).toBeVisible();

    const fontSize = await subtitle.evaluate((el) => getComputedStyle(el).fontSize);
    const size = parseFloat(fontSize);
    // text-base = 16px; allow a small tolerance either way.
    expect(size).toBeGreaterThanOrEqual(14);
    expect(size).toBeLessThanOrEqual(20);
  });

  test("main content has generous top padding for sticky header", async ({ page }) => {
    const main = page.locator("main");
    const paddingTop = await main.evaluate((el) => getComputedStyle(el).paddingTop);
    const pt = parseFloat(paddingTop);
    // pt-24 = 96px
    expect(pt).toBeGreaterThanOrEqual(90);
  });

  test("header height is 64px (h-16)", async ({ page }) => {
    const headerInner = page.locator("header > div").first();
    const height = await headerInner.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeCloseTo(64, 0);
  });
});

test.describe("FileUpload Styling", () => {
  // The drop zone lives on the Extract page (/extract), not the home landing.
  test.beforeEach(async ({ page }) => {
    await page.goto("/extract");
  });

  test("drop zone is visible with rounded corners", async ({ page }) => {
    const dropZone = page
      .locator("[data-testid='drop-zone']")
      .or(page.locator(".rounded-xl.border-dashed").first());
    // The drop zone should be visible in idle state
    await expect(dropZone).toBeVisible();
  });
});
