/**
 * Tests for the client-side string hardening helpers (SEC MED-03 /
 * MED-04 / MED-05 / LOW-07).
 */
import { describe, expect, it } from "vitest";
import {
  MAX_DISPLAY_FILENAME_LEN,
  MAX_DOWNLOAD_SLUG_LEN,
  safeClipboardText,
  safeDisplayFilename,
  safeDownloadSlug,
  safePositiveInt,
} from "./safeStrings";

describe("safeDisplayFilename", () => {
  it("returns empty string for null / undefined / empty input", () => {
    expect(safeDisplayFilename(null)).toBe("");
    expect(safeDisplayFilename(undefined)).toBe("");
    expect(safeDisplayFilename("")).toBe("");
  });

  it("passes benign filenames through unchanged", () => {
    expect(safeDisplayFilename("sample.cdx")).toBe("sample.cdx");
    expect(safeDisplayFilename("my file - v2.cdxml")).toBe("my file - v2.cdxml");
  });

  it("strips ASCII control characters", () => {
    expect(safeDisplayFilename("bad\u0000.cdx")).toBe("bad.cdx");
    expect(safeDisplayFilename("line1\nline2.cdx")).toBe("line1line2.cdx");
    expect(safeDisplayFilename("return\rback.cdx")).toBe("returnback.cdx");
  });

  it("truncates at the documented length", () => {
    const long = "a".repeat(MAX_DISPLAY_FILENAME_LEN + 100);
    expect(safeDisplayFilename(long).length).toBe(MAX_DISPLAY_FILENAME_LEN);
  });
});

describe("safeDownloadSlug", () => {
  it("passes allowlist input through", () => {
    expect(safeDownloadSlug("LFQSCWFL")).toBe("LFQSCWFL");
    expect(safeDownloadSlug("foo-bar_baz")).toBe("foo-bar_baz");
  });

  it("replaces disallowed chars with _", () => {
    expect(safeDownloadSlug("path/traversal")).toBe("path_traversal");
    expect(safeDownloadSlug("unicode.🔬")).toBe("unicode");
    expect(safeDownloadSlug('with "quote"')).toBe("with_quote");
  });

  it("uses the fallback when input collapses to empty", () => {
    expect(safeDownloadSlug(null)).toBe("structure");
    expect(safeDownloadSlug(undefined)).toBe("structure");
    expect(safeDownloadSlug("")).toBe("structure");
    expect(safeDownloadSlug("   ")).toBe("structure");
    expect(safeDownloadSlug("!!!", "fallback")).toBe("fallback");
  });

  it("caps at MAX_DOWNLOAD_SLUG_LEN", () => {
    const long = "a".repeat(MAX_DOWNLOAD_SLUG_LEN + 50);
    expect(safeDownloadSlug(long).length).toBe(MAX_DOWNLOAD_SLUG_LEN);
  });
});

describe("safeClipboardText", () => {
  it("returns empty for null / undefined", () => {
    expect(safeClipboardText(null)).toBe("");
    expect(safeClipboardText(undefined)).toBe("");
  });

  it("strips CR, LF, and NUL", () => {
    expect(safeClipboardText("CCO\nmalicious")).toBe("CCOmalicious");
    expect(safeClipboardText("CCO\rmalicious")).toBe("CCOmalicious");
    expect(safeClipboardText("CCO\u0000malicious")).toBe("CCOmalicious");
    expect(safeClipboardText("a\nb\rc\u0000d")).toBe("abcd");
  });

  it("leaves benign SMILES alone", () => {
    expect(safeClipboardText("c1ccccc1")).toBe("c1ccccc1");
    expect(safeClipboardText("CC(=O)Oc1ccccc1C(=O)O")).toBe("CC(=O)Oc1ccccc1C(=O)O");
  });
});

describe("safePositiveInt", () => {
  it("accepts positive integers", () => {
    expect(safePositiveInt(42)).toBe(42);
    expect(safePositiveInt("100")).toBe(100);
  });

  it("falls back on NaN, negatives, zero, floats", () => {
    expect(safePositiveInt(0)).toBe(1);
    expect(safePositiveInt(-5)).toBe(1);
    expect(safePositiveInt(3.14)).toBe(1);
    expect(safePositiveInt(NaN)).toBe(1);
    expect(safePositiveInt(Infinity)).toBe(1);
    expect(safePositiveInt("")).toBe(1);
    expect(safePositiveInt("javascript:alert(1)")).toBe(1);
    expect(safePositiveInt(null)).toBe(1);
  });

  it("honours custom fallback + max", () => {
    expect(safePositiveInt("garbage", { fallback: 0 })).toBe(0);
    expect(safePositiveInt(9999, { max: 100 })).toBe(100);
    expect(safePositiveInt(50, { max: 100 })).toBe(50);
  });
});
