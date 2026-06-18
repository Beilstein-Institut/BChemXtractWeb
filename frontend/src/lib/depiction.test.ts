/**
 * pickSvg — depiction selection with display-parity fallback.
 * Mirrors backend `_pick_depiction_svg` (tests/test_export_depiction.py):
 * the display fallback and the export fallback must stay identical.
 */
import { DEFAULT_DEPICTION, pickSvg } from "./depiction";

const CDK = "<svg>cdk-layout</svg>";
const CDX = "<svg>cdx-layout</svg>";

describe("DEFAULT_DEPICTION", () => {
  it("is CDK — the product default on every visit", () => {
    expect(DEFAULT_DEPICTION).toBe("cdk");
  });
});

describe("pickSvg", () => {
  it("prefers svg_cdx for the cdx depiction", () => {
    expect(pickSvg({ svg: CDK, svg_cdx: CDX }, "cdx")).toBe(CDX);
  });

  it("prefers svg for the cdk depiction", () => {
    expect(pickSvg({ svg: CDK, svg_cdx: CDX }, "cdk")).toBe(CDK);
  });

  it("defaults to the CDK depiction when none is given", () => {
    expect(pickSvg({ svg: CDK, svg_cdx: CDX })).toBe(CDK);
  });

  it("falls back to svg when svg_cdx is missing (cdx requested)", () => {
    expect(pickSvg({ svg: CDK, svg_cdx: "" }, "cdx")).toBe(CDK);
    expect(pickSvg({ svg: CDK, svg_cdx: undefined }, "cdx")).toBe(CDK);
  });

  it("falls back to svg_cdx when svg is missing (cdk requested)", () => {
    expect(pickSvg({ svg: "", svg_cdx: CDX }, "cdk")).toBe(CDX);
  });

  it("returns null when neither layout is stored", () => {
    expect(pickSvg({ svg: "", svg_cdx: "" }, "cdx")).toBeNull();
    expect(pickSvg({ svg: "", svg_cdx: undefined }, "cdk")).toBeNull();
  });
});
