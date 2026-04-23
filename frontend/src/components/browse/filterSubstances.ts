/**
 * Shared filter predicate used by the browse bento tiles and the
 * `StructureBrowser` current-page slice (Phase 3 Task 11).
 *
 * Keeps the `SearchFilter` / `BrowsePage` / `StructureBrowser` triad
 * aligned on one matching rule: the free-text query is compared
 * case-insensitively against four substance fields (formula, SMILES,
 * InChI key, IUPAC name); the three boolean chips act as presence
 * guards on the corresponding field.
 *
 * Lives in a standalone module so `BrowsePage.tsx` only exports
 * components (satisfies `react-refresh/only-export-components`).
 */
import type { SubstanceResponse } from "@/types/chemistry";

import type { BrowseFilters } from "./browseFilters";

/**
 * Return true when `substance` matches the active filters. An empty
 * filter set (no query + no chips) matches everything.
 */
export function matchesFilters(substance: SubstanceResponse, filters: BrowseFilters): boolean {
  if (filters.hasName && !substance.iupac_name?.trim()) return false;
  if (filters.hasSmiles && !substance.smiles?.trim()) return false;
  if (filters.hasInchi && !substance.inchi?.trim()) return false;

  const query = filters.q.trim().toLowerCase();
  if (!query) return true;

  const haystack = [
    substance.molecular_formula,
    substance.smiles,
    substance.inchi_key,
    substance.iupac_name,
  ]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function filterSubstances(
  substances: readonly SubstanceResponse[],
  filters: BrowseFilters,
): SubstanceResponse[] {
  return substances.filter((s) => matchesFilters(s, filters));
}
