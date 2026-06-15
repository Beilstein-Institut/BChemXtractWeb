/**
 * filterSubstances — shared predicate tests.
 */
import type { SubstanceResponse } from "@/types/chemistry";

import { EMPTY_FILTERS } from "./browseFilters";
import { filterSubstances, matchesFilters } from "./filterSubstances";

function makeSubstance(overrides: Partial<SubstanceResponse> = {}): SubstanceResponse {
  return {
    id: 1,
    inchi: "InChI=1S/C6H6",
    inchi_key: "UHOVQNZJYSORNB-UHFFFAOYSA-N",
    smiles: "c1ccccc1",
    extended_smiles: "c1ccccc1",
    iupac_name: "benzene",
    molecular_formula: "C6H6",
    aux_info: "",
    mdlv3000: "",
    abbreviations: {},
    svg: "",
    ...overrides,
  };
}

describe("matchesFilters", () => {
  it("matches everything when filters are empty", () => {
    expect(matchesFilters(makeSubstance(), EMPTY_FILTERS)).toBe(true);
  });

  it("matches formula substring case-insensitively", () => {
    const s = makeSubstance({ molecular_formula: "C6H6" });
    expect(matchesFilters(s, { ...EMPTY_FILTERS, q: "c6h" })).toBe(true);
    expect(matchesFilters(s, { ...EMPTY_FILTERS, q: "c12" })).toBe(false);
  });

  it("matches SMILES / InChI key / IUPAC name", () => {
    const s = makeSubstance();
    expect(matchesFilters(s, { ...EMPTY_FILTERS, q: "c1cccc" })).toBe(true);
    expect(matchesFilters(s, { ...EMPTY_FILTERS, q: "UHOVQN" })).toBe(true);
    expect(matchesFilters(s, { ...EMPTY_FILTERS, q: "benzene" })).toBe(true);
  });

  it("enforces hasName chip: filters out substances with no IUPAC name", () => {
    const named = makeSubstance({ iupac_name: "benzene" });
    const unnamed = makeSubstance({ iupac_name: "" });
    expect(matchesFilters(named, { ...EMPTY_FILTERS, hasName: true })).toBe(true);
    expect(matchesFilters(unnamed, { ...EMPTY_FILTERS, hasName: true })).toBe(false);
  });

  it("enforces hasSmiles + hasInchi chips", () => {
    const bare = makeSubstance({ smiles: "", inchi: "" });
    expect(matchesFilters(bare, { ...EMPTY_FILTERS, hasSmiles: true })).toBe(false);
    expect(matchesFilters(bare, { ...EMPTY_FILTERS, hasInchi: true })).toBe(false);
    expect(matchesFilters(makeSubstance(), { ...EMPTY_FILTERS, hasSmiles: true })).toBe(true);
  });

  it("treats whitespace-only query as empty", () => {
    expect(matchesFilters(makeSubstance(), { ...EMPTY_FILTERS, q: "   " })).toBe(true);
  });
});

describe("filterSubstances", () => {
  it("returns a new array containing only matches", () => {
    const list = [
      makeSubstance({ id: 1, molecular_formula: "C6H6" }),
      makeSubstance({ id: 2, molecular_formula: "H2O" }),
      makeSubstance({ id: 3, molecular_formula: "CH4", smiles: "" }),
    ];
    const out = filterSubstances(list, { ...EMPTY_FILTERS, hasSmiles: true });
    expect(out.map((s) => s.id)).toEqual([1, 2]);
  });

  it("returns every substance when filters are empty", () => {
    const list = [makeSubstance({ id: 1 }), makeSubstance({ id: 2 })];
    expect(filterSubstances(list, EMPTY_FILTERS)).toHaveLength(2);
  });
});
