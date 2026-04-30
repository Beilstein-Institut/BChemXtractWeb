/**
 * SearchResultCard — wraps StructureCard with attribution + highlight (D-10, D-11, D-13).
 *
 * For substructure hits, swaps in match_svg so the scaffold render highlights
 * the matched fragment instead of the stored substance.svg. Both SVGs flow
 * through StructureCard's Blob-URL `<img src>` path — never
 * dangerouslySetInnerHTML (T-04-04, T-09-07-01).
 */
import { Badge } from "@/components/ui/badge";
import { AttributionPill } from "@/components/AttributionPill";
import { StructureCard } from "@/components/StructureCard";
import type { SearchResult, SearchType } from "@/types/search";
import type { SubstanceResponse } from "@/types/chemistry";

export interface SearchResultCardProps {
  result: SearchResult;
  searchType: SearchType;
  onViewExtraction?: (extractionId: number) => void;
}

export function SearchResultCard({ result, searchType, onViewExtraction }: SearchResultCardProps) {
  const isSubstructure = searchType === "substructure";
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
      <StructureCard
        substance={substanceForDisplay}
        attribution={{
          count: result.extraction_count,
          extractions: result.extractions,
        }}
        onViewExtraction={onViewExtraction}
      />
      <AttributionPill
        count={result.extraction_count}
        extractions={result.extractions}
        onView={onViewExtraction}
      />
    </div>
  );
}
