import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

/**
 * Compact PubChem status chip for a structure card. Renders a skeleton while
 * loading, a linked badge for exact/scaffold matches, a muted badge for
 * absent, and nothing for idle/error (enrichment is purely additive — a
 * failed lookup must never disrupt the card).
 */
export function PubChemBadge({ state }: { state: PubChemCardState | undefined }) {
  if (!state || state.state === "idle" || state.state === "error") return null;
  if (state.state === "loading") {
    return <Skeleton data-slot="pubchem-badge-skeleton" className="h-5 w-24 rounded-full" />;
  }
  const data = state.data;
  if (!data) return null;

  const label = LABEL[data.status];
  const badge = (
    <Badge data-slot="pubchem-badge" data-status={data.status} variant={VARIANT[data.status]}>
      {label}
    </Badge>
  );

  if (data.pubchem_url) {
    return (
      <a
        data-slot="pubchem-badge-link"
        href={data.pubchem_url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${label} — view on PubChem`}
        className="inline-flex items-center gap-1 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {badge}
        <ExternalLinkIcon className="size-3 text-foreground-muted" aria-hidden="true" />
      </a>
    );
  }
  return badge;
}
