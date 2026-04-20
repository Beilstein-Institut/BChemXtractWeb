/**
 * SearchResultCard — wraps StructureCard with attribution + highlight (D-10, D-11, D-13).
 *
 * For substructure hits (searchType === 'substructure'), renders a
 * match-highlighted SVG instead of the stored substance.svg. Displays a
 * `Scaffold` Badge inline at the start of the metadata row to signal the
 * highlight context.
 *
 * Attribution chip sits BELOW the existing card (wrapper layer — StructureCard
 * internals are untouched).
 *
 * SVG rendering: both match_svg and the fallback substance.svg are rendered
 * via StructureCard's existing Blob-URL `<img src>` pattern (see
 * useSvgObjectUrl) — never dangerouslySetInnerHTML (T-04-04, T-09-07-01).
 */
import { BoxesIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StructureCard } from "@/components/StructureCard";
import type { SearchResult, SearchType } from "@/types/search";
import type { SubstanceResponse } from "@/types/chemistry";
import { cn } from "@/lib/utils";
import { safeDisplayFilename, safePositiveInt } from "@/lib/safeStrings";

export interface SearchResultCardProps {
  result: SearchResult;
  searchType: SearchType;
}

export function SearchResultCard({
  result,
  searchType,
}: SearchResultCardProps) {
  const isSubstructure = searchType === "substructure";
  // For substructure hits, swap the displayed svg to the highlighted one.
  // Preserve all other substance fields so StructureCard's copy-SMILES
  // + InChI display continue to work. The svg field is still rendered
  // via StructureCard's data-URI <img> path (T-04-04 XSS-safe).
  const substanceForDisplay: SubstanceResponse =
    isSubstructure && result.match_svg
      ? { ...result.substance, svg: result.match_svg }
      : result.substance;

  return (
    <div className="flex flex-col gap-2">
      {isSubstructure && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-5 text-micro gap-1">
            Scaffold
          </Badge>
        </div>
      )}
      <StructureCard substance={substanceForDisplay} />
      <AttributionChip
        count={result.extraction_count}
        extractions={result.extractions}
      />
    </div>
  );
}

interface AttributionChipProps {
  count: number;
  extractions: SearchResult["extractions"];
}

function AttributionChip({ count, extractions }: AttributionChipProps) {
  if (count <= 0) return null;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Found in ${count} extractions — click to see sources`}
            aria-haspopup="dialog"
            className={cn(
              "self-start focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-primary rounded"
            )}
          />
        }
      >
        <Badge
          variant="secondary"
          className="h-5 px-2 text-micro gap-1 cursor-pointer hover:bg-muted/80"
        >
          <BoxesIcon className="size-3" aria-hidden="true" />
          {`Found in ${count}`}
        </Badge>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-64 p-2">
        <ul className="flex flex-col gap-1">
          {extractions.map((e) => {
            // SEC MED-05: TypeScript types are compile-time; at runtime
            // the server could return any JSON value. Guard with
            // safePositiveInt so a non-numeric extraction_id cannot
            // interpolate into the href. Invalid values render as plain
            // text instead of a broken link.
            const id = safePositiveInt(e.extraction_id, { fallback: 0 });
            const href = id > 0 ? `/?extraction=${id}` : null;
            return (
              <li key={e.extraction_id}>
                {href ? (
                  <a
                    href={href}
                    className={cn(
                      "block p-1 rounded hover:text-primary",
                      "focus-visible:outline-none focus-visible:ring-2",
                      "focus-visible:ring-primary"
                    )}
                  >
                    <div className="text-caption text-foreground truncate">
                      {safeDisplayFilename(e.filename)}
                    </div>
                    <div className="text-micro text-muted-foreground">
                      {formatRelative(e.created_at)}
                    </div>
                  </a>
                ) : (
                  <div className="block p-1 text-caption text-muted-foreground">
                    {safeDisplayFilename(e.filename)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
