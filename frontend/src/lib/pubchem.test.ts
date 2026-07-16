import { describe, expect, it } from "vitest";

import { buildPubChemSimilarityUrl } from "./pubchem";

describe("buildPubChemSimilarityUrl", () => {
  it("builds a 2D-similarity URL for a simple SMILES", () => {
    expect(buildPubChemSimilarityUrl("c1ccccc1")).toBe(
      "https://pubchem.ncbi.nlm.nih.gov/#query=c1ccccc1&input_type=smiles&tab=similarity",
    );
  });

  it("percent-encodes hash-breaking characters (/ = etc.) so the URL survives", () => {
    // encodeURIComponent leaves ( ) alone but escapes / and = — matches the
    // form verified against the live PubChem site.
    expect(buildPubChemSimilarityUrl("CN(C)/C=C/C(=O)c1ccccc1")).toBe(
      "https://pubchem.ncbi.nlm.nih.gov/#query=CN(C)%2FC%3DC%2FC(%3DO)c1ccccc1" +
        "&input_type=smiles&tab=similarity",
    );
  });
});
