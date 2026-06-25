import { describe, it, expect } from "vitest";

import { isRealInchiKey } from "./inchi";

describe("isRealInchiKey", () => {
  it("accepts a full standard InChIKey", () => {
    expect(isRealInchiKey("UHOVQNZJYSORNB-UHFFFAOYSA-N")).toBe(true);
  });

  it("accepts PubChem-style partial prefixes", () => {
    expect(isRealInchiKey("UHOVQNZJYSORNB")).toBe(true); // block 1
    expect(isRealInchiKey("UHOVQNZJYSORNB-UHFFFAOYSA")).toBe(true); // blocks 1-2
  });

  it("rejects surrogate keys (digits) — these 422 PubChem", () => {
    expect(isRealInchiKey("S274AC64682B2D-1DB993AA24-N")).toBe(false);
  });

  it("rejects empty / nullish / malformed input", () => {
    expect(isRealInchiKey("")).toBe(false);
    expect(isRealInchiKey(null)).toBe(false);
    expect(isRealInchiKey(undefined)).toBe(false);
    expect(isRealInchiKey("not a key")).toBe(false);
    expect(isRealInchiKey("uhovqnzjysornb-uhfffaoysa-n")).toBe(false); // lowercase
  });
});
