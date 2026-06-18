/**
 * Depiction selection — shared by every structure display surface
 * (bento thumbnails, cards, table rows, detail sheet/dialog) and by the
 * export payloads, so what gets displayed and what gets exported can
 * never drift apart.
 *
 * The product default is the CDK layout ("cdk"): a fresh canonical 2D
 * layout. The original ChemDraw layout ("cdx"), which shows structures
 * exactly as drawn in the uploaded file, is the opt-in alternative via
 * the Browse toolbar toggle.
 */
import type { Depiction, SubstanceResponse } from "@/types/chemistry";

export const DEFAULT_DEPICTION: Depiction = "cdk";

/**
 * Return the stored SVG markup for `depiction`, falling back to the
 * other layout when the preferred one is missing for this structure
 * (old extractions may lack `svg_cdx`; failed CDK layouts leave `svg`
 * empty). Mirrors the backend's `_pick_depiction_svg` exactly — the
 * display fallback and the export fallback must stay identical.
 * Returns null when neither layout exists (callers show a placeholder).
 */
export function pickSvg(
  substance: Pick<SubstanceResponse, "svg" | "svg_cdx">,
  depiction: Depiction = DEFAULT_DEPICTION,
): string | null {
  const preferred = depiction === "cdx" ? substance.svg_cdx : substance.svg;
  const other = depiction === "cdx" ? substance.svg : substance.svg_cdx;
  return preferred || other || null;
}
