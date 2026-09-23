import { describe, it, expect, beforeEach } from "vitest";
import { redirectLegacySearchLink } from "@/lib/router";

describe("redirectLegacySearchLink", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));

  it("sends an old header-search link to History with its query", () => {
    window.history.replaceState(null, "", "/extract?q=C6H6&type=formula");
    redirectLegacySearchLink();
    expect(window.location.pathname + window.location.search).toBe("/history?q=C6H6&type=formula");
  });

  it("leaves Browse/History search links and plain URLs alone", () => {
    window.history.replaceState(null, "", "/browse?q=C6H6");
    redirectLegacySearchLink();
    expect(window.location.pathname).toBe("/browse");

    window.history.replaceState(null, "", "/extract");
    redirectLegacySearchLink();
    expect(window.location.pathname).toBe("/extract");
  });
});
