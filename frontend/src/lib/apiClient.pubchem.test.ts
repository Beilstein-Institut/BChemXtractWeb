import { afterEach, describe, expect, it, vi } from "vitest";
import { getPubChemCompound, postPubChemEnrich } from "@/lib/apiClient";

afterEach(() => vi.restoreAllMocks());

describe("pubchem apiClient", () => {
  it("posts a batch and returns the results map", async () => {
    const body = {
      results: {
        "UHOVQNZJYSORNB-UHFFFAOYSA-N": {
          inchi_key: "UHOVQNZJYSORNB-UHFFFAOYSA-N",
          status: "exact",
          cid: 241,
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    );
    const out = await postPubChemEnrich([
      { inchi_key: "UHOVQNZJYSORNB-UHFFFAOYSA-N", smiles: "c1ccccc1" },
    ]);
    expect(out.results["UHOVQNZJYSORNB-UHFFFAOYSA-N"].cid).toBe(241);
  });

  it("fetches single-compound detail", async () => {
    const body = { inchi_key: "X", status: "exact", cid: 241, title: "Benzene" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    );
    const out = await getPubChemCompound("UHOVQNZJYSORNB-UHFFFAOYSA-N");
    expect(out.title).toBe("Benzene");
  });
});
