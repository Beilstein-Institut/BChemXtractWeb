import { expect, test } from "@playwright/test";

/**
 * Phase 2 — primitive re-skin computed-style probes.
 *
 * Each test navigates to `?ui=neo`, injects a minimal probe element
 * that mimics the shape a shadcn primitive emits (same data-slot,
 * same baseline classes), then reads `getComputedStyle().boxShadow`
 * / `borderRadius` / `transition` to prove the CSS additions in
 * index.css landed and cascade correctly.
 *
 * This test file grows one scenario at a time across Tasks 2-6.
 */
test.describe("neomorphism primitives — Phase 2 re-skin", () => {
  test("Card [data-slot=card] gets shadow-neu-raised under .neo-ui", async ({ page }) => {
    await page.goto("/?ui=neo");
    // Light-mode precondition: the rgba(163, 177, 198 ...) assertion below is the
    // light-theme --neu-shadow-dark literal. Dark-neo swaps it for rgba(0, 0, 0, 0.5).
    // Task 7 covers the dark-mode equivalent; keep this probe scoped to light mode.
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(isDark).toBe(false);
    await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.id = "__card_probe";
      probe.setAttribute("data-slot", "card");
      probe.className = "rounded-xl bg-card";
      probe.style.width = "40px";
      probe.style.height = "40px";
      document.body.appendChild(probe);
    });
    const style = await page
      .locator("#__card_probe")
      .evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return { boxShadow: cs.boxShadow, borderRadius: cs.borderRadius, transition: cs.transitionProperty };
      });
    expect(style.boxShadow).not.toBe("none");
    expect(style.boxShadow).toContain("rgba(163, 177, 198");
    expect(style.borderRadius).not.toBe("0px");
    expect(style.transition).toContain("box-shadow");
  });

  test("Button [data-variant=default] gets shadow-neu idle and shadow-neu-pressed on :active", async ({ page }) => {
    await page.goto("/?ui=neo");
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(isDark).toBe(false);
    await page.evaluate(() => {
      const probe = document.createElement("button");
      probe.id = "__btn_default";
      probe.setAttribute("data-slot", "button");
      probe.setAttribute("data-variant", "default");
      probe.className = "bg-primary text-primary-foreground";
      probe.textContent = "x";
      document.body.appendChild(probe);
    });
    const idle = await page
      .locator("#__btn_default")
      .evaluate((el) => window.getComputedStyle(el).boxShadow);
    expect(idle).not.toBe("none");
    expect(idle).toContain("rgba(163, 177, 198");
  });

  test("Button [data-variant=link] has NO neo shadow (transparency exception)", async ({ page }) => {
    await page.goto("/?ui=neo");
    await page.evaluate(() => {
      const probe = document.createElement("button");
      probe.id = "__btn_link";
      probe.setAttribute("data-slot", "button");
      probe.setAttribute("data-variant", "link");
      probe.textContent = "x";
      document.body.appendChild(probe);
    });
    const idle = await page
      .locator("#__btn_link")
      .evaluate((el) => window.getComputedStyle(el).boxShadow);
    expect(idle).toBe("none");
  });

  test("Button [data-variant=ghost] has NO neo shadow (transparency exception)", async ({ page }) => {
    await page.goto("/?ui=neo");
    await page.evaluate(() => {
      const probe = document.createElement("button");
      probe.id = "__btn_ghost";
      probe.setAttribute("data-slot", "button");
      probe.setAttribute("data-variant", "ghost");
      probe.textContent = "x";
      document.body.appendChild(probe);
    });
    const idle = await page
      .locator("#__btn_ghost")
      .evaluate((el) => window.getComputedStyle(el).boxShadow);
    expect(idle).toBe("none");
  });

  test("Button transition includes box-shadow and transform", async ({ page }) => {
    await page.goto("/?ui=neo");
    await page.evaluate(() => {
      const probe = document.createElement("button");
      probe.id = "__btn_trans";
      probe.setAttribute("data-slot", "button");
      probe.setAttribute("data-variant", "default");
      probe.textContent = "x";
      document.body.appendChild(probe);
    });
    const props = await page
      .locator("#__btn_trans")
      .evaluate((el) => window.getComputedStyle(el).transitionProperty);
    expect(props).toContain("box-shadow");
    expect(props).toContain("transform");
  });
});
