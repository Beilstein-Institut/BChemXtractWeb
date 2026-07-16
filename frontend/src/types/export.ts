/**
 * Export types for multi-format chemical export.
 * Matches backend ExportRequest Pydantic model exactly.
 */
import type { Depiction } from "@/types/chemistry";

export type ExportFormat = "sdf" | "json" | "tsv" | "png" | "svg" | "v3000" | "rxn";

/** Human-readable labels for each format. Ordered as shown in the export dropdown. */
export const FORMAT_LABELS: Record<ExportFormat, string> = {
  sdf: "SDF / MOL",
  json: "JSON",
  tsv: "TSV",
  png: "PNG Images",
  svg: "SVG Images",
  v3000: "MDL V3000",
  rxn: "RXN / RDfile",
};

/** File extension for each format (used for suggested download filename). */
export const FORMAT_EXT: Record<ExportFormat, string> = {
  sdf: "sdf",
  json: "json",
  tsv: "tsv",
  png: "png",
  svg: "svg",
  v3000: "mol",
  rxn: "rdf",
};

/** Request body for POST /api/export. Mirrors backend ExportRequest model. */
export interface ExportRequest {
  format: ExportFormat;
  /** Explicit substance IDs. */
  substance_ids: number[];
  /** Export all substances from extraction. Used when substance_ids is empty. */
  extraction_id?: number;
  /** Explicit reaction IDs for RXN export. Mirrors substance_ids. */
  reaction_ids?: number[];
  /**
   * 2D layout for the image formats (png/svg): "cdx" = original ChemDraw
   * coordinates, "cdk" = fresh CDK layout. Backend defaults to "cdk" when
   * omitted; the UI always sends its active depiction so exports match
   * what is displayed. Ignored by the non-image formats.
   */
  depiction?: Depiction;
  /**
   * Substance ordering for the exported file. Mirrors the browse toolbar's
   * sort so a downloaded file matches what the user sees. Backend defaults to
   * "extraction_order" when omitted. Ignored for reaction (RXN) exports.
   */
  sort?: "extraction_order" | "formula";
}
