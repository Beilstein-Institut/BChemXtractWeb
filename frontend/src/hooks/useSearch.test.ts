/**
 * useSearch — Wave 5 stubs for the search URL-state + fetch hook (Plan 06).
 *
 * Tests are skipped with `describe.skip` so the file loads cleanly before the
 * implementation exists. Covers D-03 (debounce text vs. explicit substructure
 * submit) and URL-state round-trip (q/type/scope/match/page) mirroring the
 * useBrowse pattern from Phase 6.
 */
import { describe, it } from "vitest";

describe.skip("useSearch (Wave 5)", () => {
  it("reads initial q/type/scope/match/page from URL", () => {});
  it("writes state changes back to URL via replaceState", () => {});
  it("does NOT use pushState (would flood history)", () => {});
  it("debounces text-type fetches (300 ms)", () => {});
  it("does NOT debounce substructure — waits for submit()", () => {});
  it("cancels in-flight requests when inputs change", () => {});
  it("clears state when query becomes empty", () => {});
  it("submit() triggers fetch immediately", () => {});
});
