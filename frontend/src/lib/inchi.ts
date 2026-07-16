/**
 * Real (standard) InChIKey shape: 14 letters, optionally `-` + 10 letters,
 * optionally `-` + 1 letter. Mirrors the backend's INCHI_KEY_PATTERN.
 *
 * Structures whose InChI was skipped at extraction (oversized molecules /
 * fallback path) carry an empty `inchi_key` — the backend never fabricates
 * one. An empty key must not be sent to InChIKey-validated endpoints (e.g.
 * PubChem enrich/compound), which reject it with 422 — for the batch endpoint,
 * one bad key fails the whole request. Use {@link isRealInchiKey} to gate them.
 */
const REAL_INCHI_KEY_RE = /^[A-Z]{14}(?:-[A-Z]{10}(?:-[A-Z])?)?$/;

/** True when `key` is a real, PubChem-resolvable InChIKey (non-empty + valid). */
export function isRealInchiKey(key: string | null | undefined): boolean {
  return !!key && REAL_INCHI_KEY_RE.test(key);
}
