/**
 * Element helpers for lightweight formula inspection.
 *
 * Used to flag organometallic / inorganic structures in the extraction receipt
 * without pulling in a full cheminformatics parser. The scan is deliberately
 * crude: it pulls element symbols out of a molecular-formula string and checks
 * them against a metal set. Good enough for a "contains a metal" badge.
 */

// Metals + metalloids commonly seen in ChemDraw files (transition, alkali,
// alkaline-earth, post-transition, lanthanides/actinides). Not exhaustive of
// the periodic table, but covers what appears in practice.
const METAL_SYMBOLS = new Set<string>([
  // alkali / alkaline earth
  "Li",
  "Na",
  "K",
  "Rb",
  "Cs",
  "Fr",
  "Be",
  "Mg",
  "Ca",
  "Sr",
  "Ba",
  "Ra",
  // transition metals
  "Sc",
  "Ti",
  "V",
  "Cr",
  "Mn",
  "Fe",
  "Co",
  "Ni",
  "Cu",
  "Zn",
  "Y",
  "Zr",
  "Nb",
  "Mo",
  "Tc",
  "Ru",
  "Rh",
  "Pd",
  "Ag",
  "Cd",
  "Hf",
  "Ta",
  "W",
  "Re",
  "Os",
  "Ir",
  "Pt",
  "Au",
  "Hg",
  // post-transition + metalloids (B, Si, As, Se, Te, Ge, Sb, At included —
  // silyl groups like TBS/TMS and boronic acids are common in ChemDraw files)
  "Al",
  "Ga",
  "In",
  "Sn",
  "Tl",
  "Pb",
  "Bi",
  "Po",
  "B",
  "Si",
  "Ge",
  "As",
  "Sb",
  "Te",
  "Se",
  "At",
  // lanthanides + actinides
  "La",
  "Ce",
  "Pr",
  "Nd",
  "Pm",
  "Sm",
  "Eu",
  "Gd",
  "Tb",
  "Dy",
  "Ho",
  "Er",
  "Tm",
  "Yb",
  "Lu",
  "Ac",
  "Th",
  "Pa",
  "U",
  "Np",
  "Pu",
]);

// Element symbols are one uppercase letter optionally followed by one
// lowercase (e.g. "C", "Cl", "Cu"). Digits and charges are ignored.
const ELEMENT_RE = /[A-Z][a-z]?/g;

/** True when a molecular formula contains at least one metal/metalloid. */
export function formulaHasMetal(formula: string | null | undefined): boolean {
  if (!formula) return false;
  for (const sym of formula.match(ELEMENT_RE) ?? []) {
    if (METAL_SYMBOLS.has(sym)) return true;
  }
  return false;
}
