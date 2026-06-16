import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { PubChemCardState } from "@/types/chemistry";

/**
 * Rich PubChem detail panel for the structure dialog/sheet. Purely additive:
 * loading shows a skeleton; error renders a quiet retriable notice; success
 * shows title, linked CID, MW, capped synonyms, and an attributed description.
 */
export function PubChemPanel({ state }: { state: PubChemCardState }) {
  if (state.state === "idle") return null;

  if (state.state === "loading") {
    return (
      <section data-slot="pubchem-panel" className="space-y-2">
        <h4 className="text-caption font-semibold text-muted-foreground">PubChem</h4>
        <div data-testid="pubchem-panel-loading" className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
        </div>
      </section>
    );
  }

  if (state.state === "error") {
    return (
      <section data-slot="pubchem-panel" className="space-y-1">
        <h4 className="text-caption font-semibold text-muted-foreground">PubChem</h4>
        <p className="text-caption text-muted-foreground">
          PubChem is unavailable right now. Reopen this structure to retry.
        </p>
      </section>
    );
  }

  const d = state.data;
  if (!d) return null;

  if (d.status === "absent") {
    return (
      <section data-slot="pubchem-panel" className="space-y-1">
        <h4 className="text-caption font-semibold text-muted-foreground">PubChem</h4>
        <Badge variant="outline">Not in PubChem</Badge>
      </section>
    );
  }

  return (
    <section data-slot="pubchem-panel" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-caption font-semibold text-muted-foreground">PubChem</h4>
        <Badge variant={d.status === "exact" ? "success" : "secondary"}>
          {d.status === "exact" ? "In PubChem" : "Known scaffold"}
        </Badge>
      </div>

      {d.title && <p className="text-body font-medium text-foreground">{d.title}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
        {d.cid !== null && d.pubchem_url && (
          <a
            href={d.pubchem_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            CID {d.cid}
            <ExternalLinkIcon className="size-3" aria-hidden="true" />
          </a>
        )}
        {d.molecular_weight !== null && <span>MW {d.molecular_weight.toFixed(2)}</span>}
        {d.xlogp !== null && <span>XLogP {d.xlogp}</span>}
      </div>

      {d.synonyms.length > 0 && (
        <p className="text-caption text-foreground break-words">
          <span className="font-semibold text-muted-foreground">Synonyms: </span>
          {d.synonyms.join(", ")}
        </p>
      )}

      {d.description && (
        <p className="text-caption text-muted-foreground">
          {d.description}
          {d.description_source && <span className="italic"> — {d.description_source}</span>}
        </p>
      )}
    </section>
  );
}
