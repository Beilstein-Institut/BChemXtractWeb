/**
 * StructureDetail — Dialog content displaying full SVG and all metadata fields
 * for an extracted chemical substance.
 *
 * SVG is rendered via a Blob URL in an <img> src — never as raw innerHTML,
 * so a malicious backend SVG string cannot inject script into the DOM. The
 * dialog closes itself before any AttributionPill navigation
 * (handled by StructureCard's wrapper callback).
 */
import type { ReactNode } from "react";
import { FlaskConicalIcon } from "lucide-react";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/internal/CopyButton";
import { MolecularFormula } from "@/components/internal/MolecularFormula";
import { AttributionPill } from "@/components/AttributionPill";
import { PubChemPanel } from "@/components/PubChemPanel";
import { usePubChemCompound } from "@/hooks/usePubChemEnrichment";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { isRealInchiKey } from "@/lib/inchi";
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

function MetadataRow({
  label,
  value,
  display,
}: {
  label: string;
  value: string;
  /** Optional formatted display node; the raw `value` still drives copy. */
  display?: ReactNode;
}) {
  return (
    // Layout: label, copy button, value — the copy sits just before the value.
    // gap-2 keeps a small space between the icon and the value, pt-1.5 lines the
    // text up with the icon's centre.
    <div className="flex items-start gap-2">
      <span className="min-w-[120px] shrink-0 pt-1.5 text-caption font-semibold text-muted-foreground">
        {label}
      </span>
      <CopyButton value={value} label={label} className="shrink-0" />
      <span className="min-w-0 flex-1 break-all pt-1.5 text-caption text-foreground">
        {display ?? value}
      </span>
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
  // A surrogate key (SMILES hash, fails isRealInchiKey) is not a real
  // identifier: it 422s the PubChem lookup and misleads anyone who copies it.
  // One predicate gates both the PubChem query and the InChI/Key rows below.
  const hasRealKey = isRealInchiKey(substance.inchi_key);
  const pubchem = usePubChemCompound(hasRealKey ? substance.inchi_key : undefined);

  return (
    <DialogContent className="sm:max-w-2xl w-full" showCloseButton={true}>
      <DialogHeader>
        <DialogTitle>
          <MolecularFormula value={substance.molecular_formula} fallback="Structure" />
        </DialogTitle>
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
      <div className="h-[280px] sm:h-[400px] bg-white rounded-lg p-4 sm:p-6 flex items-center justify-center">
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
        {/* Show InChI / InChI Key only for a real key (mirrors StructureSheet);
            a surrogate key is hidden so it can't be mistaken for a real one. */}
        {hasRealKey && (
          <>
            {substance.inchi && <MetadataRow label="InChI" value={substance.inchi} />}
            <MetadataRow label="InChI Key" value={substance.inchi_key} />
          </>
        )}
        <MetadataRow
          label="Molecular Formula"
          value={substance.molecular_formula}
          display={<MolecularFormula value={substance.molecular_formula} />}
        />
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
