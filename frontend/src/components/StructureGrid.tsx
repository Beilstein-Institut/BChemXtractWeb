/**
 * StructureGrid — responsive 3/2/1 column grid of StructureCards, with an
 * empty state for when no structures were extracted.
 *
 * Renders the structure grid, shows all structures at once (pagination is
 * handled elsewhere), and provides an empty state.
 */
import { FlaskConicalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StructureCard } from "@/components/StructureCard";
import type { ExtractionResponse } from "@/types/chemistry";

export interface StructureGridProps {
  /** Extraction result containing substances and metadata */
  response: ExtractionResponse;
  /** Called when user clicks "Upload another file" in the empty state */
  onReset: () => void;
}

/**
 * StructureGrid — renders all extracted substances in a responsive CSS grid.
 *
 * Empty state: shown when `response.structure_count === 0`. Displays a
 * FlaskConical icon, a descriptive message, and an "Upload another file" button.
 *
 * Grid state: 1 column on mobile, 2 on md, 3 on lg. No pagination in this
 * view — all extracted substances are rendered at once.
 */
export function StructureGrid({ response, onReset }: StructureGridProps) {
  if (response.structure_count === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <FlaskConicalIcon className="size-12 text-muted-foreground" />
        <h2 className="text-sub-heading font-semibold">No structures found</h2>
        <p className="text-body text-muted-foreground max-w-[400px]">
          {response.filename} did not contain any extractable structures. Try a different file.
        </p>
        <Button variant="default" onClick={onReset}>
          Upload another file
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {response.substances.map((substance, index) => (
        <StructureCard
          key={`${substance.inchi_key || substance.smiles || "unknown"}-${index}`}
          substance={substance}
        />
      ))}
    </div>
  );
}
