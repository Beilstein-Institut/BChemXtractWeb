/**
 * StructureDetail — Dialog content displaying full SVG and all metadata fields
 * for an extracted chemical substance.
 *
 * Rendered inside a Dialog controlled by StructureCard. SVG is rendered via
 * a Blob URL in an <img> src (T-04-04 threat mitigation — never as raw
 * innerHTML).
 */
import { FlaskConicalIcon } from "lucide-react";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/internal/CopyButton";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import type { SubstanceResponse } from "@/types/chemistry";

export interface StructureDetailProps {
  /** The substance whose full metadata to display */
  substance: SubstanceResponse;
}

/** Labeled metadata field + CopyButton for the detail dialog. */
function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-caption font-semibold text-muted-foreground min-w-[120px] shrink-0">
        {label}
      </span>
      <span className="text-caption text-foreground break-all flex-1">{value}</span>
      <CopyButton value={value} label={label} />
    </div>
  );
}

/**
 * StructureDetail — full metadata view for a substance, designed to be placed
 * inside a Dialog (DialogContent) opened by StructureCard.
 *
 * SVG is rendered via a Blob URL in an <img> src attribute — never as raw
 * innerHTML — to prevent XSS (T-04-04).
 */
export function StructureDetail({ substance }: StructureDetailProps) {
  const svgSrc = useSvgObjectUrl(substance.svg);

  return (
    <DialogContent className="sm:max-w-2xl w-full" showCloseButton={true}>
      <DialogHeader>
        <DialogTitle>{substance.molecular_formula}</DialogTitle>
        <DialogDescription>Detailed structure metadata</DialogDescription>
      </DialogHeader>

      {/* SVG container: 400px fixed height */}
      <div className="h-[400px] bg-background rounded-lg p-6 flex items-center justify-center">
        {svgSrc ? (
          <img
            src={svgSrc}
            alt={`${substance.molecular_formula} structure — full size`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full bg-muted rounded">
            <FlaskConicalIcon className="size-12 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Metadata rows */}
      <div className="space-y-3 mt-4">
        <MetadataRow label="SMILES" value={substance.smiles} />
        <MetadataRow label="InChI" value={substance.inchi} />
        <MetadataRow label="InChI Key" value={substance.inchi_key} />
        <MetadataRow label="Molecular Formula" value={substance.molecular_formula} />
        {/* MDL V3000 row is conditional — only render when non-empty */}
        {substance.mdlv3000 && <MetadataRow label="MDL V3000" value={substance.mdlv3000} />}
      </div>

      <DialogFooter showCloseButton={true} />
    </DialogContent>
  );
}
