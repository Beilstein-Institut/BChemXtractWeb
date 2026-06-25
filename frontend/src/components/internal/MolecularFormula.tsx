/**
 * MolecularFormula — render a molecular formula string the way chemists write
 * it: element-count digits as subscripts (C6H6 → C₆H₆) and a trailing ionic
 * charge as a superscript ([C6H5O]2- → [C₆H₅O]²⁻). Element symbols, brackets,
 * and dots pass through inline.
 *
 * Shared across every place a formula is shown (cards, table, detail dialog,
 * side sheet, bento) so the formatting is identical everywhere. The rendered
 * `textContent` is unchanged from the raw string (subscripts/superscripts are
 * inline elements), so copy/serialisation and text assertions still see e.g.
 * "C6H6".
 */
import type { ReactNode } from "react";

export interface MolecularFormulaProps {
  /** Raw formula, e.g. "C6H12O6" or "[C6H5O]2-". */
  value: string | null | undefined;
  /** Rendered when `value` is empty/nullish. Defaults to an em dash. */
  fallback?: ReactNode;
}

// A trailing charge: optional magnitude digits followed by one or more signs,
// e.g. "+", "-", "2+", "3-". Matched only at the very end of the string.
const _CHARGE_RE = /(\d*[+-]+)$/;

/** Format a formula into React nodes (subscript counts + superscript charge). */
function formatMolecularFormula(
  value: string | null | undefined,
  fallback: ReactNode = "—",
): ReactNode {
  if (!value) return fallback;

  let core = value;
  let charge = "";
  const chargeMatch = value.match(_CHARGE_RE);
  if (chargeMatch) {
    charge = chargeMatch[1];
    core = value.slice(0, value.length - charge.length);
  }

  // Split the core on digit runs; digit runs are element counts (subscript).
  const nodes: ReactNode[] = core
    .split(/(\d+)/)
    .filter((part) => part.length > 0)
    .map((part, i) =>
      /^\d+$/.test(part) ? (
        <sub key={`c${i}`} className="align-baseline text-[0.75em]">
          {part}
        </sub>
      ) : (
        <span key={`e${i}`}>{part}</span>
      ),
    );

  if (charge) {
    nodes.push(
      <sup key="charge" className="text-[0.75em]">
        {charge}
      </sup>,
    );
  }

  return <>{nodes}</>;
}

/** Render a molecular formula with subscript counts + superscript charge. */
export function MolecularFormula({ value, fallback }: MolecularFormulaProps) {
  return <>{formatMolecularFormula(value, fallback)}</>;
}
