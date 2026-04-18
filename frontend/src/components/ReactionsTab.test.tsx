/**
 * Stubs for ReactionsTab orchestrator (Plan 05-01). All describes are .skip in Wave 0.
 */
import { describe, it } from "vitest";

describe.skip("ReactionsTab — Wave 0 stubs", () => {
  it("idle state shows ExperimentalBanner + pre-extract EmptyState with 'Extract reactions' button", () => {
    // Plan 05-01 — UI-SPEC §3a
  });
  it("idle state (file not in memory) shows re-upload EmptyState + file picker", () => {
    // Plan 05-01 — UI-SPEC §3a re-upload variant
  });
  it("loading state shows centered spinner + 'Extracting reactions from {filename}...'", () => {
    // Plan 05-01 — UI-SPEC §3b
  });
  it("success state renders ReactionCard list + ReactionsMetadataRow + Export reactions button", () => {
    // Plan 05-01 — UI-SPEC §3c
  });
  it("zero-reactions state shows 'No reactions detected' EmptyState (no retry CTA)", () => {
    // Plan 05-01 — UI-SPEC §3d
  });
  it("error state shows 'Reaction extraction didn't work' EmptyState with Try again button", () => {
    // Plan 05-01 — UI-SPEC §3e
  });
  it("timeout warning surfaces as sonner toast, not inline", () => {
    // Plan 05-01 — UI-SPEC §4 timeout behavior
  });
  it("cachedReactions prop bypasses extract-trigger and renders the reaction list directly (D-23 history hydration)", () => {
    // Plan 05-01 — D-23 loading a history entry with reaction_count>0 pre-hydrates this tab
  });
});
