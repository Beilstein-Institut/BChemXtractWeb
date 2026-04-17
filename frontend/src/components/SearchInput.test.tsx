/**
 * SearchInput — Wave 5 stubs for the global smart-box search input.
 *
 * Tests are skipped with `describe.skip` so the file loads cleanly before the
 * implementation (Plan 06) exists. Each `it()` captures a required behavior
 * from D-01 (smart-box + badge), D-03 (debounce vs. submit), and
 * D-18 (keyboard shortcut).
 */
import { describe, it } from "vitest";

describe.skip("SearchInput (Wave 5)", () => {
  it("renders placeholder 'Search structures…' when empty", () => {});
  it("focuses on `/` keydown from anywhere outside text inputs", () => {});
  it("does not focus on `/` when already inside an input", () => {});
  it("clears + blurs on Escape key", () => {});
  it("shows type-detection badge once input ≥ 2 chars", () => {});
  it("opens type-override popover when badge clicked", () => {});
  it("debounces text-type queries (~300 ms)", () => {});
  it("requires explicit submit for substructure type", () => {});
  it("shows spinner while request in flight, × when idle with content", () => {});
  it("shows / kbd hint only when empty AND not focused", () => {});
});
