/**
 * PubChem URL builders.
 *
 * Kept in one place so the exact query shapes are defined once and unit-tested.
 */
const PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov";

/**
 * Build a PubChem 2D-similarity search URL for a SMILES.
 *
 * Verified against the live PubChem site: this hash launches a Tanimoto-based
 * 2D similarity search ("Similarity" tab) for the given structure. The SMILES
 * is percent-encoded because it can contain characters that break a URL hash —
 * `#` (triple bond), `+` (charge), `/` and `\` (stereo) — and PubChem decodes
 * them back before parsing.
 */
export function buildPubChemSimilarityUrl(smiles: string): string {
  return `${PUBCHEM_BASE}/#query=${encodeURIComponent(smiles)}&input_type=smiles&tab=similarity`;
}
