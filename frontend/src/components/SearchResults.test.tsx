/**
 * SearchResults — Wave 6 stubs for the dedicated search result view.
 *
 * Tests are skipped with `describe.skip` so the file loads cleanly before the
 * implementation (Plan 07) exists. Covers D-10 (global scope + attribution),
 * D-11 (dedicated view + metadata row), D-12 (empty state with DidYouMean),
 * and D-13 (match-highlight SVG rendering).
 */
import { describe, it } from "vitest";

describe.skip("SearchResults (Wave 6)", () => {
  it("renders metadata row with count, query, type, scope", () => {});
  it("renders 6-card skeleton while loading", () => {});
  it("renders empty state with DidYouMean when 0 results", () => {});
  it("renders SearchResultCard grid on success", () => {});
  it("shows attribution chip with 'Found in N'", () => {});
  it("opens attribution popover on chip click", () => {});
  it("renders match_svg when present (substructure hit)", () => {});
  it("falls back to stored svg when match_svg absent", () => {});
  it("renders Pagination component below grid", () => {});
  it("shows retry button on error", () => {});
  it("shows Scaffold badge inline on substructure hits", () => {});
});
