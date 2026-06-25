import { act, renderHook, waitFor } from "@testing-library/react";
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

function enabledWrapper(enabled: boolean, available = true) {
  return ({ children }: { children: React.ReactNode }) => (
    <PubChemPreferencesContext.Provider value={{ enabled, setEnabled: () => null, available }}>
      {children}
    </PubChemPreferencesContext.Provider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("usePubChemEnrichment", () => {
  it("does not fetch when disabled", () => {
    const spy = vi.spyOn(api, "postPubChemEnrich");
    renderHook(() => usePubChemEnrichment([makeSubstance("KEYAXXXXXXXXXX-AAAAAAAAAA-N")]), {
      wrapper: enabledWrapper(false),
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not fetch when the server feature is unavailable", () => {
    const spy = vi.spyOn(api, "postPubChemEnrich");
    renderHook(() => usePubChemEnrichment([makeSubstance("KEYAXXXXXXXXXX-AAAAAAAAAA-N")]), {
      wrapper: enabledWrapper(true, false),
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("fetches and exposes per-key state when enabled", async () => {
    vi.spyOn(api, "postPubChemEnrich").mockResolvedValue({
      results: {
        "KEYAXXXXXXXXXX-AAAAAAAAAA-N": {
          inchi_key: "KEYAXXXXXXXXXX-AAAAAAAAAA-N",
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
      () => usePubChemEnrichment([makeSubstance("KEYAXXXXXXXXXX-AAAAAAAAAA-N")]),
      { wrapper: enabledWrapper(true) },
    );
    await waitFor(() =>
      expect(result.current.get("KEYAXXXXXXXXXX-AAAAAAAAAA-N")?.state).toBe("success"),
    );
    expect(result.current.get("KEYAXXXXXXXXXX-AAAAAAAAAA-N")?.data?.cid).toBe(241);
  });

  it("never sends surrogate keys to the batch endpoint (would 422 the whole batch)", async () => {
    const spy = vi.spyOn(api, "postPubChemEnrich").mockResolvedValue({ results: {} });
    const real = "AAAAAAAAAAAAAA-AAAAAAAAAA-N";
    const surrogate = "S274AC64682B2D-1DB993AA24-N"; // SMILES-hash surrogate (has digits)
    renderHook(() => usePubChemEnrichment([makeSubstance(real), makeSubstance(surrogate)]), {
      wrapper: enabledWrapper(true),
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const sentKeys = spy.mock.calls[0][0].map((i) => i.inchi_key);
    expect(sentKeys).toEqual([real]);
    expect(sentKeys).not.toContain(surrogate);
  });

  it("does not fetch at all when every key is a surrogate", () => {
    const spy = vi.spyOn(api, "postPubChemEnrich");
    renderHook(() => usePubChemEnrichment([makeSubstance("S274AC64682B2D-1DB993AA24-N")]), {
      wrapper: enabledWrapper(true),
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("re-requests a key whose first fetch was cancelled by a list change", async () => {
    const A = "AAAAAAAAAAAAAA-AAAAAAAAAA-N";
    const B = "BBBBBBBBBBBBBB-AAAAAAAAAA-N";
    // First call never resolves (simulates a request still in flight when the
    // substance list changes); subsequent calls resolve empty.
    const spy = vi
      .spyOn(api, "postPubChemEnrich")
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue({ results: {} });

    const { rerender } = renderHook(({ subs }) => usePubChemEnrichment(subs), {
      wrapper: enabledWrapper(true),
      initialProps: { subs: [makeSubstance(A)] },
    });
    // First effect fired one in-flight request for A.
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    // List grows -> keys change -> first effect is cancelled, new effect runs.
    await act(async () => {
      rerender({ subs: [makeSubstance(A), makeSubstance(B)] });
    });

    // The second request must include A (it was cancelled before settling, so
    // it must be re-requested — not left stuck on the loading skeleton).
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    const secondCallKeys = spy.mock.calls[1][0].map((i) => i.inchi_key);
    expect(secondCallKeys).toContain(A);
  });
});
