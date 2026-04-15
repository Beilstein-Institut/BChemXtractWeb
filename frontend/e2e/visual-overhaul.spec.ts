import { test, expect } from "@playwright/test";

// ─────────────────────────────────────────────────────
// Phase 7.1: Visual Overhaul — E2E Tests
//
// Covers: AppHeader, nav links, dark/light toggle,
//         mobile hamburger, typography, FileUpload styling
// ─────────────────────────────────────────────────────

test.describe("AppHeader", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders sticky header with brand text", async ({ page }) => {
    const header = page.locator("header").first();
    await expect(header).toBeVisible();

    // Sticky positioning
    await expect(header).toHaveCSS("position", "sticky");

    // Brand text eventually resolves to BChemXtractWeb (after scramble animation)
    await expect(header.getByText("BChemXtractWeb")).toBeVisible({ timeout: 3000 });
  });

  test("header has glass backdrop-filter effect", async ({ page }) => {
    const header = page.locator("header").first();
    const backdropFilter = await header.evaluate(
      (el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter
    );
    expect(backdropFilter).toContain("blur");
  });

  test("desktop nav links are visible at 1280px width", async ({ page }) => {
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();

    await expect(nav.getByText("Extract")).toBeVisible();
    await expect(nav.getByText("Browse")).toBeVisible();
    await expect(nav.getByText("History")).toBeVisible();
  });

  test("hamburger is hidden at desktop width", async ({ page }) => {
    const hamburger = page.getByLabel("Open navigation menu");
    await expect(hamburger).toBeHidden();
  });
});

test.describe("Dark/Light Mode Toggle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("toggle button exists in header", async ({ page }) => {
    const toggle = page.locator("header").getByRole("button", {
      name: /switch to (light|dark) mode/i,
    });
    await expect(toggle).toBeVisible();
  });

  test("clicking toggle switches between light and dark mode", async ({ page }) => {
    const html = page.locator("html");

    // Get initial state
    const initialClasses = await html.getAttribute("class");
    const startedDark = initialClasses?.includes("dark");

    // Click the toggle
    const toggle = page.locator("header").getByRole("button", {
      name: /switch to (light|dark) mode/i,
    });
    await toggle.click();

    // Class should have changed
    if (startedDark) {
      await expect(html).toHaveClass(/light/);
    } else {
      await expect(html).toHaveClass(/dark/);
    }

    // Click again to toggle back
    await toggle.click();
    if (startedDark) {
      await expect(html).toHaveClass(/dark/);
    } else {
      await expect(html).not.toHaveClass(/dark/);
    }
  });

  test("toggle is a button, not a dropdown menu", async ({ page }) => {
    const toggle = page.locator("header").getByRole("button", {
      name: /switch to (light|dark) mode/i,
    });
    await toggle.click();

    // No dropdown/popover should appear — verify no menu role elements
    const menu = page.getByRole("menu");
    await expect(menu).toHaveCount(0);
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

  test("dark/light toggle visible on mobile", async ({ page }) => {
    const toggle = page.locator("header").getByRole("button", {
      name: /switch to (light|dark) mode/i,
    });
    await expect(toggle).toBeVisible();
  });
});

test.describe("Nav Link Scroll Anchors", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Extract link has href #extract", async ({ page }) => {
    const link = page.locator('nav[aria-label="Main navigation"]').getByText("Extract");
    await expect(link).toHaveAttribute("href", "#extract");
  });

  test("Browse link has href #browse", async ({ page }) => {
    const link = page.locator('nav[aria-label="Main navigation"]').getByText("Browse");
    await expect(link).toHaveAttribute("href", "#browse");
  });

  test("History link has href #history", async ({ page }) => {
    const link = page.locator('nav[aria-label="Main navigation"]').getByText("History");
    await expect(link).toHaveAttribute("href", "#history");
  });

  test("extract section has matching id and scroll-mt", async ({ page }) => {
    const section = page.locator("#extract");
    await expect(section).toBeVisible();
    await expect(section).toHaveClass(/scroll-mt-24/);
  });

  test("clicking Extract nav link scrolls to extract section", async ({ page }) => {
    const link = page.locator('nav[aria-label="Main navigation"]').getByText("Extract");
    await link.click();

    // URL hash should update
    await expect(page).toHaveURL(/#extract/);
  });
});

test.describe("Typography and Spacing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("hero h1 uses display-size typography (~40px)", async ({ page }) => {
    const h1 = page.locator("h1").filter({ hasText: "BChemXtractWeb" });
    await expect(h1).toBeVisible();

    const fontSize = await h1.evaluate((el) => getComputedStyle(el).fontSize);
    const size = parseFloat(fontSize);
    expect(size).toBeGreaterThanOrEqual(36);
    expect(size).toBeLessThanOrEqual(44);
  });

  test("subtitle uses sub-heading typography (~21px)", async ({ page }) => {
    const subtitle = page.locator("p").filter({
      hasText: "Extract chemical structures from ChemDraw files.",
    });
    await expect(subtitle).toBeVisible();

    const fontSize = await subtitle.evaluate((el) => getComputedStyle(el).fontSize);
    const size = parseFloat(fontSize);
    expect(size).toBeGreaterThanOrEqual(18);
    expect(size).toBeLessThanOrEqual(24);
  });

  test("main content has generous top padding for sticky header", async ({ page }) => {
    const main = page.locator("main");
    const paddingTop = await main.evaluate((el) => getComputedStyle(el).paddingTop);
    const pt = parseFloat(paddingTop);
    // pt-24 = 96px
    expect(pt).toBeGreaterThanOrEqual(90);
  });

  test("header height is 48px (h-12)", async ({ page }) => {
    const headerInner = page.locator("header > div").first();
    const height = await headerInner.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeCloseTo(48, 0);
  });
});

test.describe("FileUpload Styling", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("drop zone is visible with rounded corners", async ({ page }) => {
    const dropZone = page.locator("[data-testid='drop-zone']").or(
      page.locator(".rounded-xl.border-dashed").first()
    );
    // The drop zone should be visible in idle state
    await expect(dropZone).toBeVisible();
  });

  test("Extract structures button is pill-shaped (rounded-full)", async ({ page }) => {
    const extractBtn = page.getByRole("button", { name: /extract structures/i });
    if (await extractBtn.isVisible()) {
      const borderRadius = await extractBtn.evaluate(
        (el) => getComputedStyle(el).borderRadius
      );
      const radius = parseFloat(borderRadius);
      // rounded-full = 9999px
      expect(radius).toBeGreaterThan(100);
    }
  });
});

test.describe("Smooth Scrolling", () => {
  test("html element has smooth scroll behavior", async ({ page }) => {
    await page.goto("/");

    const scrollBehavior = await page.locator("html").evaluate(
      (el) => getComputedStyle(el).scrollBehavior
    );
    expect(scrollBehavior).toBe("smooth");
  });
});
