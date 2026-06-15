/**
 * Browse filter contract.
 *
 * Kept in a standalone module so `SearchFilter.tsx` and the `filterSubstances`
 * helper can share the type without pulling each other into their component
 * import graph (satisfies the react-refresh/only-export-components rule).
 */

export interface BrowseFilters {
  /** Free-text query — matches formula/SMILES/InChI key/IUPAC name. */
  q: string;
  /** When true, only show substances whose `iupac_name` is non-empty. */
  hasName: boolean;
  /** When true, only show substances whose `smiles` is non-empty. */
  hasSmiles: boolean;
  /** When true, only show substances whose `inchi` is non-empty. */
  hasInchi: boolean;
}

export const EMPTY_FILTERS: BrowseFilters = Object.freeze({
  q: "",
  hasName: false,
  hasSmiles: false,
  hasInchi: false,
}) as BrowseFilters;

/** Convenience: `true` when any filter is non-default. */
export function hasActiveFilters(filters: BrowseFilters): boolean {
  return filters.q.trim() !== "" || filters.hasName || filters.hasSmiles || filters.hasInchi;
}
