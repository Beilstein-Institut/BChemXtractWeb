/**
 * Stubs for ExtractionTabs container (Plan 05-02). All describes are .skip in Wave 0.
 */
import { describe, it } from "vitest";

describe.skip("ExtractionTabs — Wave 0 stubs", () => {
  it("renders Substances (N) and Reactions tabs with Experimental pill badge", () => {
    // Plan 05-02 — UI-SPEC §1
  });
  it("default active tab is Substances", () => {
    // Plan 05-02
  });
  it("tab switch is local state — does not modify URL", () => {
    // D-08 explicit: URL-state stays Phase 6's
  });
  it("Arrow Left/Right navigates between tabs (base-ui default)", () => {
    // Plan 05-02 — a11y
  });
  it("inactive tab content unmounts (ReactionsTab in-flight request aborted via AbortController)", () => {
    // Plan 05-02 — Pitfall 10
  });
  it("reset active tab to Substances when extraction changes", () => {
    // Plan 05-02
  });
});
