/**
 * Base-path translation.
 *
 * Production serves the SPA below the origin root behind a reverse proxy, so
 * every route literal in the app is root-relative and gets translated here.
 * Getting this wrong is invisible in dev (BASE_URL is "/", every helper is an
 * identity function) and breaks every URL in production, so both shapes are
 * asserted.
 *
 * `import.meta.env.BASE_URL` is baked in at build time, so the module is
 * re-imported per case with the value stubbed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadWithBase(baseUrl: string) {
  vi.stubEnv("BASE_URL", baseUrl);
  vi.resetModules();
  return import("./basePath");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("basePath at the origin root", () => {
  it("leaves routes, API paths and assets untouched", async () => {
    const { BASE, withBase, stripBase, asset } = await loadWithBase("/");

    expect(BASE).toBe("");
    expect(withBase("/extract")).toBe("/extract");
    expect(withBase("/api/csrf-token")).toBe("/api/csrf-token");
    expect(stripBase("/extract")).toBe("/extract");
    expect(stripBase("/")).toBe("/");
    expect(asset("logo.svg")).toBe("/logo.svg");
    expect(asset("/logo.svg")).toBe("/logo.svg");
  });
});

describe("basePath under a sub-path deployment", () => {
  it("prefixes routes, API paths and assets", async () => {
    const { BASE, withBase, asset } = await loadWithBase("/bchemxtract/");

    expect(BASE).toBe("/bchemxtract");
    expect(withBase("/extract")).toBe("/bchemxtract/extract");
    expect(withBase("/api/csrf-token")).toBe("/bchemxtract/api/csrf-token");
    expect(asset("logo.svg")).toBe("/bchemxtract/logo.svg");
    expect(asset("/logo.svg")).toBe("/bchemxtract/logo.svg");
  });

  it("strips the prefix back off browser pathnames", async () => {
    const { stripBase } = await loadWithBase("/bchemxtract/");

    expect(stripBase("/bchemxtract/extract")).toBe("/extract");
    // Both the bare prefix and its trailing-slash form are the home route:
    // Apache forwards /bchemxtract with no slash, so this is a live case.
    expect(stripBase("/bchemxtract")).toBe("/");
    expect(stripBase("/bchemxtract/")).toBe("/");
  });

  it("round-trips every route literal the app matches on", async () => {
    const { withBase, stripBase } = await loadWithBase("/bchemxtract/");

    for (const route of [
      "/",
      "/about",
      "/terms",
      "/license",
      "/imprint",
      "/privacy",
      "/limitations",
      "/view",
      "/settings",
      "/batch",
      "/browse",
      "/history",
      "/extract",
    ]) {
      expect(stripBase(withBase(route))).toBe(route);
    }
  });
});
