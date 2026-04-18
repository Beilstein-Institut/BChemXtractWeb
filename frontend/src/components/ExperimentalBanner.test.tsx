/**
 * Stubs for ExperimentalBanner (Plan 04-03). All describes are .skip in Wave 0.
 */
import { describe, it } from "vitest";

describe.skip("ExperimentalBanner — Wave 0 stubs", () => {
  it("renders amber bg + border-l-amber-500 stripe + AlertTriangleIcon + lead word 'Experimental.'", () => {
    // Plan 04-03 — UI-SPEC §2 anatomy
  });
  it("role='note' on container (NOT role='alert')", () => {
    // Plan 04-03 — a11y
  });
  it("dismiss button writes sessionStorage key 'bcx.reactions.experimentalBannerDismissed' = '1'", () => {
    // D-09 session-only dismissal
  });
  it("returns null on mount when sessionStorage key is already set", () => {
    // Plan 04-03
  });
  it("does not persist dismissal across browser sessions (sessionStorage, NOT localStorage — Pitfall 7)", () => {
    // Plan 04-03
  });
});
