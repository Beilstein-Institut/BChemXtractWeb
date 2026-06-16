import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/apiClient";
import { PubChemPreferencesContext } from "@/context/PubChemPreferencesContext";
import { usePubChemEnrichment } from "@/hooks/usePubChemEnrichment";
import type { SubstanceResponse } from "@/types/chemistry";

function makeSubstance(key: string): SubstanceResponse {
  return {
    id: 1,
    inchi: "",
    inchi_key: key,
    smiles: "c1ccccc1",
    extended_smiles: "",
    iupac_name: "",
    molecular_formula: "C6H6",
    aux_info: "",
    mdlv3000: "",
    abbreviations: {},
    svg: "",
  };
}

function enabledWrapper(enabled: boolean) {
  return ({ children }: { children: React.ReactNode }) => (
    <PubChemPreferencesContext.Provider value={{ enabled, setEnabled: () => null }}>
      {children}
    </PubChemPreferencesContext.Provider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("usePubChemEnrichment", () => {
  it("does not fetch when disabled", () => {
    const spy = vi.spyOn(api, "postPubChemEnrich");
    renderHook(() => usePubChemEnrichment([makeSubstance("KEY1XXXXXXXXXX-AAAAAAAAAA-N")]), {
      wrapper: enabledWrapper(false),
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("fetches and exposes per-key state when enabled", async () => {
    vi.spyOn(api, "postPubChemEnrich").mockResolvedValue({
      results: {
        "KEY1XXXXXXXXXX-AAAAAAAAAA-N": {
          inchi_key: "KEY1XXXXXXXXXX-AAAAAAAAAA-N",
          status: "exact",
          cid: 241,
          iupac_name: null,
          molecular_formula: "C6H6",
          molecular_weight: null,
          canonical_smiles: null,
          isomeric_smiles: null,
          xlogp: null,
          pubchem_url: "https://pubchem.ncbi.nlm.nih.gov/compound/241",
          connectivity_cid_count: 0,
          title: null,
          synonyms: [],
          description: null,
          description_source: null,
        },
      },
    });
    const { result } = renderHook(
      () => usePubChemEnrichment([makeSubstance("KEY1XXXXXXXXXX-AAAAAAAAAA-N")]),
      { wrapper: enabledWrapper(true) },
    );
    await waitFor(() =>
      expect(result.current.get("KEY1XXXXXXXXXX-AAAAAAAAAA-N")?.state).toBe("success"),
    );
    expect(result.current.get("KEY1XXXXXXXXXX-AAAAAAAAAA-N")?.data?.cid).toBe(241);
  });
});
