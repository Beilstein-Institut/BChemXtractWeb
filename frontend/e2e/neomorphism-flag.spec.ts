import { expect, test } from "@playwright/test";

test.describe("neomorphism flag — Phase 1 pipeline", () => {
  test("default path: neo-ui class absent; legacy palette intact", async ({ page }) => {
    await page.goto("/");
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass ?? "").not.toContain("neo-ui");
    expect(htmlClass ?? "").not.toContain("hc");
  });

  test("?ui=neo: neo-ui class is added to <html>", async ({ page }) => {
    await page.goto("/?ui=neo");
    await expect(page.locator("html")).toHaveClass(/\bneo-ui\b/);
  });

  test("?ui=neo + ?hc=on: both classes are added", async ({ page }) => {
    await page.goto("/?ui=neo&hc=on");
    const htmlEl = page.locator("html");
    await expect(htmlEl).toHaveClass(/\bneo-ui\b/);
    await expect(htmlEl).toHaveClass(/\bhc\b/);
  });

  test("localStorage persistence: neo-ui survives reload", async ({ page }) => {
    await page.goto("/?ui=neo");
    await page.evaluate(() => localStorage.setItem("bchemxtract-ui-mode", "neo"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\bneo-ui\b/);
  });

  test("?ui=legacy overrides stored neo preference", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("bchemxtract-ui-mode", "neo"));
    await page.goto("/?ui=legacy");
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass ?? "").not.toContain("neo-ui");
  });

  test("shadow-neu utility renders a non-empty computed box-shadow under .neo-ui", async ({
    page,
  }) => {
    await page.goto("/?ui=neo");
    await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.id = "__neu_probe";
      probe.className = "shadow-neu";
      probe.style.width = "10px";
      probe.style.height = "10px";
      probe.style.background = "var(--neu-surface)";
      document.body.appendChild(probe);
    });
    const boxShadow = await page
      .locator("#__neu_probe")
      .evaluate((el) => window.getComputedStyle(el).boxShadow);
    expect(boxShadow).not.toBe("none");
    expect(boxShadow).toContain("rgba(163, 177, 198");
  });

  test("dark + neo-ui compose: both classes present", async ({ page }) => {
    await page.goto("/?ui=neo");
    await page.evaluate(() => {
      localStorage.setItem("bchemxtract-theme", "dark");
    });
    await page.goto("/?ui=neo");
    const htmlEl = page.locator("html");
    await expect(htmlEl).toHaveClass(/\bneo-ui\b/);
    await expect(htmlEl).toHaveClass(/\bdark\b/);
  });
});
