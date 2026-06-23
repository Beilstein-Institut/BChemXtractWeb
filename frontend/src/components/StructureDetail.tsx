/**
 * StructureDetail — Dialog content displaying full SVG and all metadata fields
 * for an extracted chemical substance.
 *
 * SVG is rendered via a Blob URL in an <img> src — never as raw innerHTML,
 * so a malicious backend SVG string cannot inject script into the DOM. The
 * dialog closes itself before any AttributionPill navigation
 * (handled by StructureCard's wrapper callback).
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
import { AttributionPill } from "@/components/AttributionPill";
import { PubChemPanel } from "@/components/PubChemPanel";
import { usePubChemCompound } from "@/hooks/usePubChemEnrichment";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { DEFAULT_DEPICTION, pickSvg } from "@/lib/depiction";
import type { Depiction, SubstanceResponse } from "@/types/chemistry";
import type { StructureCardAttribution } from "@/components/StructureCard";

export interface StructureDetailProps {
  /** The substance whose full metadata to display */
  substance: SubstanceResponse;
  /** Optional attribution data — when provided, renders the chip in the header. */
  attribution?: StructureCardAttribution;
  /** Fired when the user clicks the chip / picks an extraction in the popover. */
  onViewExtraction?: (extractionId: number) => void;
  /** Active 2D layout (CDK "cdk" default / ChemDraw "cdx"). */
  depiction?: Depiction;
}

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

export function StructureDetail({
  substance,
  attribution,
  onViewExtraction,
  depiction = DEFAULT_DEPICTION,
}: StructureDetailProps) {
  const svgSrc = useSvgObjectUrl(pickSvg(substance, depiction));
  const pubchem = usePubChemCompound(substance.inchi_key);

  return (
    <DialogContent className="sm:max-w-2xl w-full" showCloseButton={true}>
      <DialogHeader>
        <DialogTitle>{substance.molecular_formula}</DialogTitle>
        <DialogDescription>Detailed structure metadata</DialogDescription>
      </DialogHeader>

      {attribution && attribution.count > 0 && (
        <div className="-mt-1">
          <AttributionPill
            count={attribution.count}
            extractions={attribution.extractions}
            onView={onViewExtraction}
          />
        </div>
      )}

      {/* SVG container: 400px fixed height */}
      <div className="h-[280px] sm:h-[400px] bg-background rounded-lg p-4 sm:p-6 flex items-center justify-center">
        {svgSrc ? (
          // key={depiction}: fade in the swapped layout (motion-reduce: none).
          <img
            key={depiction}
            src={svgSrc}
            alt={`${substance.molecular_formula} structure — full size`}
            className="max-h-full max-w-full object-contain animate-in fade-in duration-200 motion-reduce:animate-none"
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

      {pubchem.state !== "idle" && (
        <div className="mt-4 border-t border-border pt-4">
          <PubChemPanel state={pubchem} smiles={substance.smiles} />
        </div>
      )}

      <DialogFooter showCloseButton={true} />
    </DialogContent>
  );
}
