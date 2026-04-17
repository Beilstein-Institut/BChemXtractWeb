/**
 * DidYouMean — suggestion chips inside the search empty state (D-12, D-19).
 *
 * Renders up to 2 accent-outlined Button chips per UI-SPEC §5. Each chip
 * either rewrites the query+type or is explanatory only (no onSuggest
 * callback fired). Parent `SearchResults` plugs this into `EmptyState`'s
 * `action` slot.
 */
import { Button } from "@/components/ui/button";
import type { SearchType } from "@/types/search";

export interface DidYouMeanProps {
  type: "inchi_key" | "formula" | "smiles" | "substructure";
  query: string;
  onSuggest: (update: { type?: SearchType; query?: string }) => void;
}

export function DidYouMean({ type, query, onSuggest }: DidYouMeanProps) {
  const chips: { label: string; action?: () => void }[] = [];

  if (type === "smiles") {
    chips.push({
      label: "Try a substructure search instead",
      action: () => onSuggest({ type: "substructure" }),
    });
  } else if (type === "formula") {
    const simplified = query.replace(/H\d+/g, "");
    if (simplified !== query) {
      chips.push({
        label: "Try simplifying the formula (strip explicit hydrogens)",
        action: () => onSuggest({ query: simplified }),
      });
    } else {
      chips.push({
        label: "Try simplifying the formula (strip explicit hydrogens)",
      });
    }
  } else if (type === "inchi_key") {
    chips.push({ label: "Double-check the 27-character InChI key format" });
  } else {
    chips.push({ label: "Broaden the SMARTS pattern" });
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {chips.map((c) => (
        <Button
          key={c.label}
          type="button"
          variant="outline"
          size="sm"
          className="text-primary border-primary/40 hover:bg-primary/5"
          disabled={!c.action}
          onClick={c.action}
        >
          {c.label}
        </Button>
      ))}
    </div>
  );
}
