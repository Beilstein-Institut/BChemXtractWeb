/**
 * Stubs for ReactionSheet (Plan 04-02). All describes are .skip in Wave 0.
 */
import { describe, it } from "vitest";

describe.skip("ReactionSheet — Wave 0 stubs", () => {
  it("renders all RInChI variants (short/long/web) with copy buttons", () => {
    // Plan 04-02
  });
  it("renders reaction SMILES + rinchi + aux_info with copy buttons", () => {
    // Plan 04-02
  });
  it("renders REACTANTS section with per-component InChI + InChI Key rows", () => {
    // Plan 04-02
  });
  it("renders PRODUCTS section", () => {
    // Plan 04-02
  });
  it("renders AGENTS section only when agents.length > 0", () => {
    // Plan 04-02 — zero-agent reactions suppress heading per UI-SPEC §5
  });
  it("ArrowLeft navigates to previous reaction", () => {
    // Plan 04-02 — keyboard contract from StructureSheet
  });
  it("ArrowRight navigates to next reaction", () => {
    // Plan 04-02
  });
  it("+/-/0 zooms the reaction SVG", () => {
    // Plan 04-02
  });
});
