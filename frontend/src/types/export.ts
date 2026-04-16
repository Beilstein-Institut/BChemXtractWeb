/**
 * Export types for Phase 8 multi-format chemical export.
 * Matches backend ExportRequest Pydantic model exactly.
 */

export type ExportFormat =
  | "sdf"
  | "json"
  | "csv"
  | "png"
  | "svg"
  | "cml"
  | "v3000"
  | "rxn";

/** Human-readable labels for each format. Ordered as shown in UI-SPEC dropdown. */
export const FORMAT_LABELS: Record<ExportFormat, string> = {
  sdf: "SDF / MOL",
  json: "JSON",
  csv: "CSV",
  png: "PNG Images",
  svg: "SVG Images",
  cml: "CML",
  v3000: "MDL V3000",
  rxn: "RXN / RDfile",
};

/** File extension for each format (used for suggested download filename). */
export const FORMAT_EXT: Record<ExportFormat, string> = {
  sdf: "sdf",
  json: "json",
  csv: "csv",
  png: "png",
  svg: "svg",
  cml: "cml",
  v3000: "mol",
  rxn: "rdf",
};

/** Request body for POST /api/export. Mirrors backend ExportRequest model. */
export interface ExportRequest {
  format: ExportFormat;
  /** Explicit substance IDs (D-01, D-02, D-04). */
  substance_ids: number[];
  /** Export all substances from extraction (D-03). Used when substance_ids is empty. */
  extraction_id?: number;
}
