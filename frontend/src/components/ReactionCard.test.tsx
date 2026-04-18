/**
 * Stubs for ReactionCard (Plan 04-01). All describes are .skip in Wave 0.
 */
import { describe, it } from "vitest";

describe.skip("ReactionCard — Wave 0 stubs", () => {
  it("renders reaction SVG via data:image/svg+xml data URI with encodeURIComponent", () => {
    // Plan 04-01 implementation
  });
  it("falls back to 'Depiction unavailable' placeholder when reaction.svg is empty", () => {
    // D-13 fallback per UI-SPEC §4
  });
  it("renders reaction_smiles with copy button (stopPropagation on click)", () => {
    // Plan 04-01 — copy button does not trigger sheet open
  });
  it("renders short_rinchi_key with copy button", () => {
    // Plan 04-01
  });
  it("renders component chip: '3 reactants · 2 products · 1 agent'", () => {
    // Plan 04-01 — agents omitted when count = 0
  });
  it("opens ReactionSheet on card click", () => {
    // Plan 04-01
  });
  it("opens ReactionSheet on Enter or Space keypress", () => {
    // Plan 04-01 — a11y
  });
});
