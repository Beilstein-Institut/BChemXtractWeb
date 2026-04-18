/**
 * Stubs for useReactions hook (Plan 03-02). All describes are .skip in Wave 0.
 */
import { describe, it } from "vitest";

describe.skip("useReactions — Wave 0 stubs", () => {
  it("initial state is idle (state='idle', result=null, errorMessage=null)", () => {
    // Plan 03-02 — mirrors useExtract
  });
  it("transitions idle → loading → success on successful POST /api/reactions", () => {
    // Plan 03-02
  });
  it("transitions idle → loading → error on 4xx/5xx response", () => {
    // Plan 03-02
  });
  it("transitions idle → loading → success with reactions=[] on timeout warning (200 status)", () => {
    // D-06 — timeout is 200+warning, hook treats as success
  });
  it("extract() uses AbortController to cancel prior in-flight request (Pitfall 10)", () => {
    // Plan 03-02
  });
  it("reset() returns to idle state", () => {
    // Plan 03-02
  });
});
