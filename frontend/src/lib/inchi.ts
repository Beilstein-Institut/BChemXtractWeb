/**
 * Real (standard) InChIKey shape: 14 letters, optionally `-` + 10 letters,
 * optionally `-` + 1 letter. Mirrors the backend's INCHI_KEY_PATTERN.
 *
 * Structures whose InChI was skipped at extraction get a SMILES-hash surrogate
 * key (prefix "S", contains digits) which fails this pattern. Such keys must
 * never be sent to InChIKey-validated endpoints (e.g. PubChem enrich/compound),
 * which reject them with 422 — for the batch endpoint, one bad key fails the
 * whole request. Use {@link isRealInchiKey} to filter them out.
 */
const REAL_INCHI_KEY_RE = /^[A-Z]{14}(?:-[A-Z]{10}(?:-[A-Z])?)?$/;

/** True when `key` is a real, PubChem-resolvable InChIKey (not a surrogate). */
export function isRealInchiKey(key: string | null | undefined): boolean {
  return !!key && REAL_INCHI_KEY_RE.test(key);
}
