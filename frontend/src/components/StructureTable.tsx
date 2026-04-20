/**
 * StructureTable — compact table view for extracted substances (D-06, D-16, DISP-04).
 *
 * Columns: [checkbox] [thumbnail] [formula] [SMILES] [InChI key] [copy]
 *
 * SVG thumbnails are rendered as URL-encoded data URIs (T-04-04 mitigation — same
 * pattern as StructureCard). Never set innerHTML with backend SVG strings.
 *
 * SMILES is truncated at 40 chars with a Tooltip showing the full string.
 * InChI key is truncated to 27 chars (prefix) with a Tooltip. Column is hidden
 * on mobile (hidden md:table-cell) per UI-SPEC.
 */
import { useState, useRef, useEffect } from "react";
import {
  ClipboardIcon,
  CheckIcon,
  FlaskConicalIcon,
} from "lucide-react";
import { toast } from "sonner";
import { safeClipboardText } from "@/lib/safeStrings";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SubstanceResponse } from "@/types/chemistry";

export interface StructureTableProps {
  substances: SubstanceResponse[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectAll: () => void;
  allSelected: boolean;
  onOpen: (index: number) => void;
  loading?: boolean;
}

const SMILES_MAX = 40;
const INCHI_KEY_MAX = 27;
const SKELETON_ROWS = 12;

/**
 * StructureTable — table view with checkbox selection, SVG thumbnail,
 * formula, truncated SMILES, InChI key, and copy button per D-06.
 */
export function StructureTable({
  substances,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  allSelected,
  onOpen,
  loading = false,
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
          <StructureTableRow
            key={substance.id}
            substance={substance}
            index={index}
            selected={selectedIds.has(substance.id)}
            onToggleSelect={onToggleSelect}
            onOpen={onOpen}
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
}

function StructureTableRow({
  substance,
  index,
  selected,
  onToggleSelect,
  onOpen,
}: RowProps) {
  const [isCopied, setIsCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // URL-encode SVG as data URI — never set innerHTML (T-04-04, T-06-06)
  const svgSrc = substance.svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(substance.svg)}`
    : null;

  const smilesTruncated =
    substance.smiles.length > SMILES_MAX
      ? substance.smiles.slice(0, SMILES_MAX) + "…"
      : substance.smiles;

  const inchiKeyTruncated =
    substance.inchi_key.length > INCHI_KEY_MAX
      ? substance.inchi_key.slice(0, INCHI_KEY_MAX) + "…"
      : substance.inchi_key;

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(safeClipboardText(substance.smiles));
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      setIsCopied(true);
      copyTimerRef.current = setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("Failed to copy — try selecting the text manually.");
    }
  }

  return (
    <TableRow
      className={cn(
        "min-h-[56px] cursor-pointer hover:bg-muted/50 transition-colors",
        selected && "bg-primary/5"
      )}
      data-selected={selected}
      onClick={() => onOpen(index)}
    >
      {/* Checkbox cell — stop propagation to prevent row click */}
      <TableCell
        onClick={(e) => e.stopPropagation()}
        className="w-10"
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(substance.id)}
          aria-label={`Select ${substance.molecular_formula}`}
        />
      </TableCell>

      {/* SVG thumbnail — 48×48px */}
      <TableCell className="w-14">
        {svgSrc ? (
          <img
            src={svgSrc}
            alt={`${substance.molecular_formula} structure`}
            className="h-12 w-12 object-contain"
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
            render={
              <span className="block max-w-[200px] truncate text-xs text-muted-foreground" />
            }
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
            render={
              <span className="block text-xs text-muted-foreground font-mono" />
            }
          >
            {inchiKeyTruncated}
          </TooltipTrigger>
          <TooltipContent>{substance.inchi_key}</TooltipContent>
        </Tooltip>
      </TableCell>

      {/* Copy SMILES button — stop propagation to prevent row click */}
      <TableCell
        onClick={(e) => e.stopPropagation()}
        className="w-10"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={isCopied ? "Copied!" : "Copy SMILES to clipboard"}
          onClick={handleCopy}
        >
          {isCopied ? (
            <CheckIcon className="size-3.5 text-primary" />
          ) : (
            <ClipboardIcon className="size-3.5 text-muted-foreground" />
          )}
        </Button>
      </TableCell>
    </TableRow>
  );
}
