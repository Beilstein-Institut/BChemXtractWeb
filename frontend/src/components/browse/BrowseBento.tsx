/**
 * BrowseBento — compact extraction receipt for the Browse page.
 *
 * One low panel, split into sections at `lg` so it fills width instead of
 * leaving a void:
 *
 *   ┌───────────────────┬──────────────────────────────┬────────────┐
 *   │ CURRENT EXTRACTION │  4  unique structures        │ 3 reactions│
 *   │ m16284363-12.cdx   │  InChI status (names gaps)   │ (if any)   │
 *   │ CDX · 22 KB · 3.6s │                              │            │
 *   └───────────────────┴──────────────────────────────┴────────────┘
 *
 * Deliberately NOT an export hub: export lives in the toolbar on the list
 * directly below, so a second export control here just duplicated it. The
 * reactions section only appears when reactions actually exist — an empty
 * "no reactions" note read as an error and told the user nothing useful.
 *
 * InChI status is driven by the *real* per-structure InChI (`substance.inchi`
 * non-empty), not `info.no_inchis`. When the rich extractor times out on one
 * giant molecule, the small structures get an InChI recomputed from SMILES and
 * the oversized one is skipped — so a file lands "3 of 4". The status names the
 * structures still missing a key (by formula) so "open a structure" points at a
 * specific one; the detail sheet's Generate InChI action does the rest (and
 * reports, per structure, when a molecule is too complex to compute).
 */
import { AlertTriangleIcon, CheckIcon, DatabaseIcon, FileIcon, SparklesIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { MolecularFormula } from "@/components/internal/MolecularFormula";
import { cn } from "@/lib/utils";
import type { SubstanceInfoResponse } from "@/types/chemistry";

export interface BrowseBentoProps {
  /** Source filename, headline of the receipt. */
  filename: string;
  /** ChemDraw format label, e.g. "cdxml". */
  format?: string;
  /** Uploaded file size in bytes. */
  fileSize?: number;
  /** Server-side extraction wall time in ms. */
  extractionTimeMs?: number;
  /** Fragment / substance counts from the backend (the dedup story). */
  info?: SubstanceInfoResponse;
  /** Structures shown (== `substances.length`). */
  structureCount: number;
  /**
   * Count of structures matching the active SearchFilter above the receipt,
   * and whether a filter is applied. Lets the receipt flag when the filter has
   * narrowed or emptied the grid below, instead of contradicting it silently.
   */
  filteredCount?: number;
  filtersActive?: boolean;
  /**
   * Molecular formula (or "") for each structure with NO real InChI. Length
   * is the missing count; non-empty entries name the gaps in the status.
   */
  missingInchi: readonly string[];
  /** Backend warnings. The fragment-fallback one is folded into the InChI
   *  status and filtered out here. */
  warnings?: readonly string[];
  /**
   * Known reaction count. When falsy (none, or not yet extracted), the
   * reactions section is hidden — the Reactions tab below owns that story.
   */
  reactionCount?: number;
  /**
   * PubChem match summary, shown only when the user has enrichment on
   * (`active`). Counts are over DISTINCT enrichable InChIKeys. `matched` =
   * exact hits; `settled` = lookups that succeeded or errored (drives the
   * "checking" state); `errored` = failed lookups (kept separate so a network
   * outage is not reported as "0 matched"). `mwMin`/`mwMax` are the molecular
   * weight range across matched compounds.
   */
  pubchem?: {
    active: boolean;
    matched: number;
    total: number;
    settled: number;
    errored: number;
    mwMin?: number;
    mwMax?: number;
  };
  /** Distinct ChemDraw abbreviations expanded across the file (Ph, Bn, ...). */
  abbreviationCount?: number;
  /** Structures whose formula contains a metal / metalloid. */
  metalCount?: number;
  className?: string;
}

/** "84 KB" / "1.2 MB" — null when the size is unknown/invalid. */
function formatBytes(bytes?: number): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** "0.4s" — matches ExtractionSummary's format. null when unknown. */
function formatTime(ms?: number): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Section divider: vertical when the panel is split, horizontal when stacked. */
function Divider() {
  return (
    <>
      <div className="hidden w-px shrink-0 self-stretch bg-border lg:block" />
      <div className="h-px w-full shrink-0 bg-border lg:hidden" />
    </>
  );
}

/** PubChem match summary — only rendered when enrichment is on. */
function PubChemStatus({
  matched,
  total,
  settled,
  errored,
  mwMin,
  mwMax,
}: {
  matched: number;
  total: number;
  settled: number;
  errored: number;
  mwMin?: number;
  mwMax?: number;
}) {
  if (total === 0) return null;

  // Still resolving — every lookup that has neither succeeded nor errored.
  if (settled < total) {
    return (
      <p className="flex items-center gap-1.5 text-caption text-foreground-muted">
        <DatabaseIcon className="size-3.5 shrink-0 text-secondary" aria-hidden="true" />
        Checking PubChem…
      </p>
    );
  }

  // Every lookup failed — a network/service problem, NOT "none are in PubChem".
  if (errored >= total) {
    return (
      <p className="flex items-center gap-1.5 text-caption text-foreground-muted">
        <DatabaseIcon className="size-3.5 shrink-0 text-secondary" aria-hidden="true" />
        Could not reach PubChem.
      </p>
    );
  }

  // MW range over matched compounds; compare the ROUNDED values so two weights
  // that round to the same integer render "MW 320", not "MW 320 to 320".
  let mw: string | null = null;
  if (mwMin != null && mwMax != null) {
    const lo = Math.round(mwMin);
    const hi = Math.round(mwMax);
    mw = lo === hi ? `MW ${lo}` : `MW ${lo} to ${hi}`;
  }

  return (
    <p className="flex items-center gap-1.5 text-caption text-foreground-muted">
      <DatabaseIcon className="size-3.5 shrink-0 text-secondary" aria-hidden="true" />
      <span className="font-medium text-foreground">
        {matched} of {total}
      </span>{" "}
      matched in PubChem
      {errored > 0 && ` · ${errored} not checked`}
      {mw && ` · ${mw}`}
    </p>
  );
}

/**
 * InChI usability. Quiet when everything resolved; an inviting prompt that
 * NAMES the structures still missing a key otherwise, so the guidance points
 * at a specific structure instead of a vague "the rest". Never an alarming
 * error — a missing key is recoverable per structure in the detail sheet.
 */
function InchiStatus({ total, missing }: { total: number; missing: readonly string[] }) {
  if (total === 0) return null;

  const have = total - missing.length;
  if (have >= total) {
    return (
      <p className="flex items-center gap-1.5 text-caption text-foreground-muted">
        <CheckIcon className="size-3.5 shrink-0 text-secondary" aria-hidden="true" />
        {total === 1 ? "InChI key resolved." : `All ${total} InChI keys resolved.`}
      </p>
    );
  }

  const allMissing = have === 0;
  const named = missing.filter(Boolean);
  const shown = named.slice(0, 3);
  // "and N more" must count ALL still-missing structures, not just the named
  // ones — structures without a formula are still missing an InChI key.
  const extra = missing.length - shown.length;
  const openTarget = allMissing ? "any structure" : missing.length === 1 ? "it" : "them";

  return (
    <div className="flex items-start gap-2 rounded-lg bg-surface-muted px-2.5 py-2">
      <SparklesIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-caption leading-snug text-foreground-muted">
        <span className="font-medium text-foreground">
          {allMissing
            ? "InChI keys are not available for this file."
            : `${have} of ${total} structures have an InChI key.`}
        </span>{" "}
        {named.length > 0 && (
          <>
            Missing:{" "}
            {shown.map((f, i) => (
              <span key={i} className="font-medium text-foreground">
                {i > 0 && ", "}
                <MolecularFormula value={f} />
              </span>
            ))}
            {extra > 0 && ` and ${extra} more`}.{" "}
          </>
        )}
        Open {openTarget} below to generate the InChI and InChIKey.
      </p>
    </div>
  );
}

export function BrowseBento({
  filename,
  format,
  fileSize,
  extractionTimeMs,
  info,
  structureCount,
  filteredCount,
  filtersActive,
  missingInchi,
  warnings,
  reactionCount,
  pubchem,
  abbreviationCount,
  metalCount,
  className,
}: BrowseBentoProps) {
  const fragments = info?.no_fragments;
  const deduped = fragments != null && fragments > structureCount;
  const showReactions = reactionCount != null && reactionCount > 0;

  // Compact composition facts, dot-joined into a single muted line so they
  // add breadth, not height, to the receipt.
  const facts = [
    abbreviationCount
      ? `${abbreviationCount} abbreviation${abbreviationCount === 1 ? "" : "s"} expanded`
      : null,
    metalCount ? `${metalCount} with a metal or metalloid` : null,
  ].filter(Boolean);

  const provenance = [format?.toUpperCase(), formatBytes(fileSize), formatTime(extractionTimeMs)]
    .filter(Boolean)
    .join(" · ");

  // The fragment-fallback warning is jargon and duplicates the InChI status,
  // which now says the same thing in plain language. Suppress just that one.
  // ponytail: matched by phrase; a structured `used_fallback` flag on the API
  // would be cleaner if a second warning ever collides.
  const otherWarnings = (warnings ?? []).filter((w) => !/fragment fallback/i.test(w));

  return (
    <Card
      data-slot="browse-bento"
      className={cn(
        "bg-surface",
        // Subtle entrance so a fresh extraction settles in rather than snapping.
        "duration-500 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none",
        className,
      )}
    >
      <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
        {/* Identity — icon tile anchors the block so the wide column reads
            deliberate instead of half-empty. */}
        <section
          data-slot="browse-bento-identity"
          className="flex min-w-0 items-center gap-4 lg:flex-1"
        >
          <div
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-muted text-primary"
          >
            <FileIcon className="size-6" />
          </div>
          <div className="min-w-0">
            <p className="text-caption font-medium uppercase tracking-wide text-foreground-muted">
              Current extraction
            </p>
            <h2
              className="truncate font-display text-2xl font-semibold leading-tight text-foreground"
              title={filename}
            >
              {filename}
            </h2>
            {provenance && (
              <p className="mt-0.5 font-mono text-sm text-foreground-muted">{provenance}</p>
            )}
          </div>
        </section>

        <Divider />

        {/* Results: count + InChI status + any real warnings */}
        <section
          data-slot="browse-bento-results"
          className="flex min-w-0 flex-col justify-center gap-2.5 lg:flex-[1.4]"
        >
          <div className="flex items-baseline gap-3">
            <span className="font-display text-6xl font-bold leading-[0.85] tracking-tight tabular-nums text-primary">
              {structureCount.toLocaleString()}
            </span>
            <span className="text-sm font-semibold text-foreground">
              unique {structureCount === 1 ? "structure" : "structures"}
              {deduped && (
                <span className="block text-caption font-normal text-foreground-muted">
                  from {fragments!.toLocaleString()} fragments
                </span>
              )}
            </span>
          </div>

          {filtersActive && filteredCount != null && (
            <p
              className={cn(
                "text-caption",
                filteredCount === 0
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-foreground-muted",
              )}
            >
              {filteredCount === 0
                ? "No structures match your filter."
                : `${filteredCount.toLocaleString()} of ${structureCount.toLocaleString()} match your filter.`}
            </p>
          )}

          <InchiStatus total={structureCount} missing={missingInchi} />

          {pubchem?.active && (
            <PubChemStatus
              matched={pubchem.matched}
              total={pubchem.total}
              settled={pubchem.settled}
              errored={pubchem.errored}
              mwMin={pubchem.mwMin}
              mwMax={pubchem.mwMax}
            />
          )}

          {facts.length > 0 && (
            <p className="text-caption text-foreground-muted">{facts.join(" · ")}</p>
          )}

          {otherWarnings.length > 0 && (
            <div className="space-y-1 text-caption text-amber-700 dark:text-amber-300">
              {otherWarnings.map((w, i) => (
                <p key={i} className="flex items-start gap-1.5">
                  <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>{w}</span>
                </p>
              ))}
            </div>
          )}
        </section>

        {showReactions && (
          <>
            <Divider />
            <section
              data-slot="browse-bento-reactions"
              className="flex items-center gap-2.5 lg:flex-none"
            >
              <span className="font-display text-3xl font-bold leading-none tabular-nums text-secondary">
                {reactionCount!.toLocaleString()}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {reactionCount === 1 ? "reaction" : "reactions"}
                </p>
                <p className="text-caption text-foreground-muted">in this file</p>
              </div>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
