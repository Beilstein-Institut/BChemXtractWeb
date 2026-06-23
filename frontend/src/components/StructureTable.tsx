/**
 * StructureTable — compact table view for extracted substances.
 *
 * Columns: [checkbox] [thumbnail] [formula] [SMILES] [InChI key] [copy]
 *
 * SVG thumbnails are rendered via Blob URLs (same pattern as StructureCard).
 * Never set innerHTML with backend SVG strings, so a malicious SVG cannot
 * inject script into the DOM.
 *
 * SMILES is truncated at 40 chars with a Tooltip showing the full string.
 * InChI key is truncated to 27 chars (prefix) with a Tooltip. Column is hidden
 * on mobile (hidden md:table-cell).
 */
import { FlaskConicalIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/internal/CopyButton";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { cn } from "@/lib/utils";
import { DEFAULT_DEPICTION, pickSvg } from "@/lib/depiction";
import type { Depiction, SubstanceResponse } from "@/types/chemistry";

export interface StructureTableProps {
  substances: SubstanceResponse[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectAll: () => void;
  allSelected: boolean;
  onOpen: (index: number) => void;
  loading?: boolean;
  /** Active 2D layout for thumbnails (CDK "cdk" default / ChemDraw "cdx"). */
  depiction?: Depiction;
}

const SMILES_MAX = 40;
const INCHI_KEY_MAX = 27;
const SKELETON_ROWS = 12;

/**
 * StructureTable — table view with checkbox selection, SVG thumbnail,
 * formula, truncated SMILES, InChI key, and copy button.
 */
export function StructureTable({
  substances,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  allSelected,
  onOpen,
  loading = false,
  depiction = DEFAULT_DEPICTION,
}: StructureTableProps) {
  if (loading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead className="w-14">Thumbnail</TableHead>
            <TableHead>Formula</TableHead>
            <TableHead>SMILES</TableHead>
            <TableHead className="hidden md:table-cell">InChI Key</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <TableRow key={i} className="h-14">
              <TableCell>
                <Skeleton className="h-4 w-4 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-12 w-12 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-40 rounded" />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Skeleton className="h-4 w-32 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-8 w-8 rounded" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={allSelected}
              onCheckedChange={onSelectAll}
              aria-label="Select all on page"
            />
          </TableHead>
          <TableHead className="w-14">Thumbnail</TableHead>
          <TableHead>Formula</TableHead>
          <TableHead>SMILES</TableHead>
          <TableHead className="hidden md:table-cell">InChI Key</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {substances.map((substance, index) => (
          // Composite key: ids can be 0 across a fresh-upload envelope.
          <StructureTableRow
            key={`${substance.id}-${substance.inchi_key}-${index}`}
            substance={substance}
            index={index}
            selected={selectedIds.has(substance.id)}
            onToggleSelect={onToggleSelect}
            onOpen={onOpen}
            depiction={depiction}
          />
        ))}
      </TableBody>
    </Table>
  );
}

interface RowProps {
  substance: SubstanceResponse;
  index: number;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onOpen: (index: number) => void;
  depiction: Depiction;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + "\u2026" : value;
}

function StructureTableRow({
  substance,
  index,
  selected,
  onToggleSelect,
  onOpen,
  depiction,
}: RowProps) {
  const svgSrc = useSvgObjectUrl(pickSvg(substance, depiction));

  const smilesTruncated = truncate(substance.smiles, SMILES_MAX);
  const inchiKeyTruncated = truncate(substance.inchi_key, INCHI_KEY_MAX);

  return (
    <TableRow
      className={cn(
        "min-h-[56px] cursor-pointer hover:bg-muted/50 transition-colors",
        selected && "bg-primary/5",
      )}
      data-selected={selected}
      onClick={() => onOpen(index)}
    >
      {/* Checkbox cell — stop propagation to prevent row click */}
      <TableCell onClick={(e) => e.stopPropagation()} className="w-10">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(substance.id)}
          aria-label={`Select ${substance.molecular_formula}`}
        />
      </TableCell>

      {/* SVG thumbnail — 48×48px */}
      <TableCell className="w-14">
        {svgSrc ? (
          // key={depiction}: fade in the swapped layout (motion-reduce: none).
          <img
            key={depiction}
            src={svgSrc}
            alt={`${substance.molecular_formula} structure`}
            className="h-12 w-12 object-contain animate-in fade-in duration-200 motion-reduce:animate-none"
          />
        ) : (
          <div className="h-12 w-12 flex items-center justify-center bg-muted rounded">
            <FlaskConicalIcon className="size-5 text-muted-foreground" />
          </div>
        )}
      </TableCell>

      {/* Molecular formula */}
      <TableCell>
        <span className="text-xs font-semibold">{substance.molecular_formula}</span>
      </TableCell>

      {/* SMILES — truncated at 40 chars with Tooltip */}
      <TableCell>
        <Tooltip>
          <TooltipTrigger
            render={<span className="block max-w-[200px] truncate text-xs text-muted-foreground" />}
          >
            {smilesTruncated}
          </TooltipTrigger>
          <TooltipContent>{substance.smiles}</TooltipContent>
        </Tooltip>
      </TableCell>

      {/* InChI key — truncated to 27 chars, hidden on mobile */}
      <TableCell className="hidden md:table-cell">
        <Tooltip>
          <TooltipTrigger
            render={<span className="block text-xs text-muted-foreground font-mono" />}
          >
            {inchiKeyTruncated}
          </TooltipTrigger>
          <TooltipContent>{substance.inchi_key}</TooltipContent>
        </Tooltip>
      </TableCell>

      {/* Copy SMILES button — stop propagation to prevent row click */}
      <TableCell onClick={(e) => e.stopPropagation()} className="w-10">
        <CopyButton value={substance.smiles} label="SMILES" stopPropagation mutedIcon />
      </TableCell>
    </TableRow>
  );
}
