import { ExternalLinkIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PubChemWordmark } from "@/components/internal/PubChemWordmark";
import { buildPubChemSimilarityUrl } from "@/lib/pubchem";
import type { PubChemCardState, PubChemStatus } from "@/types/chemistry";

const LABEL: Record<PubChemStatus, string> = {
  exact: "In PubChem",
  scaffold: "Known scaffold",
  absent: "Not in PubChem",
};

const VARIANT: Record<PubChemStatus, "success" | "secondary" | "outline"> = {
  exact: "success",
  scaffold: "secondary",
  absent: "outline",
};

// The wordmark stays a neutral brand mark; the status colour lives on the Badge.
const WORDMARK_CLASS = "h-3 w-auto shrink-0 text-foreground-muted";
const CONTROL_CLASS =
  "inline-flex items-center gap-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&:hover_[data-slot=pubchem-badge]]:underline";

/**
 * PubChem status control for a structure card.
 *
 * Renders the official PubChem wordmark plus the status as a single
 * interactive control:
 *   - exact / scaffold (a real ``pubchem_url`` exists) → a link that opens the
 *     PubChem page directly in a new tab.
 *   - absent → a button that toasts and opens PubChem's 2D-similarity search
 *     for this SMILES, so the user can find similar molecules.
 *
 * Loading renders a skeleton; idle / error / missing-data render nothing —
 * enrichment is purely additive and must never disrupt the card. Clicks
 * ``stopPropagation`` so the surrounding card does not also open.
 */
export function PubChemBadge({
  state,
  smiles,
}: {
  state: PubChemCardState | undefined;
  /** SMILES of this structure — used to build the similarity search for absent. */
  smiles?: string;
}) {
  if (!state || state.state === "idle" || state.state === "error") return null;
  if (state.state === "loading") {
    return <Skeleton data-slot="pubchem-badge-skeleton" className="h-5 w-28 rounded-full" />;
  }
  const data = state.data;
  if (!data) return null;

  const label = LABEL[data.status];
  const wordmark = <PubChemWordmark className={WORDMARK_CLASS} />;
  const statusBadge = (
    <Badge data-slot="pubchem-badge" data-status={data.status} variant={VARIANT[data.status]}>
      {label}
    </Badge>
  );

  // exact / scaffold — a direct link to the matched PubChem page.
  if (data.pubchem_url) {
    return (
      <a
        data-slot="pubchem-badge-link"
        href={data.pubchem_url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${label} — open on PubChem`}
        className={CONTROL_CLASS}
        onClick={(e) => e.stopPropagation()}
      >
        {wordmark}
        {statusBadge}
        <ExternalLinkIcon className="size-3 text-foreground-muted" aria-hidden="true" />
      </a>
    );
  }

  // absent — offer a 2D-similarity search when we have a SMILES to search with.
  if (smiles) {
    const searchSimilar = (e: React.MouseEvent) => {
      e.stopPropagation();
      toast("Not on PubChem — searching for similar molecules");
      window.open(buildPubChemSimilarityUrl(smiles), "_blank", "noopener,noreferrer");
    };
    return (
      <button
        type="button"
        data-slot="pubchem-badge-search"
        aria-label="Not in PubChem — search for similar molecules on PubChem"
        className={CONTROL_CLASS}
        onClick={searchSimilar}
      >
        {wordmark}
        {statusBadge}
        <SearchIcon className="size-3 text-foreground-muted" aria-hidden="true" />
      </button>
    );
  }

  // absent with no SMILES to search — show the status without an action.
  return (
    <span data-slot="pubchem-badge-static" className="inline-flex items-center gap-1.5">
      {wordmark}
      {statusBadge}
    </span>
  );
}
