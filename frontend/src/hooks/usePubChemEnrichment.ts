import { useEffect, useRef, useState } from "react";
import { getPubChemCompound, postPubChemEnrich } from "@/lib/apiClient";
import { usePubChemPreferences } from "@/hooks/usePubChemPreferences";
import type { PubChemCardState, SubstanceResponse } from "@/types/chemistry";

const BATCH_MAX = 50;

/**
 * Tier-1 batch enrichment for a list of visible substances. Fetches only when
 * the user has opted in. Dedups InChIKeys, chunks to the server's batch cap,
 * and memoizes results across re-renders so scrolling doesn't refetch.
 *
 * Returns a Map keyed by InChIKey. Missing keys = not yet requested.
 */
export function usePubChemEnrichment(
  substances: SubstanceResponse[],
): Map<string, PubChemCardState> {
  const { enabled } = usePubChemPreferences();
  const [states, setStates] = useState<Map<string, PubChemCardState>>(new Map());
  const requested = useRef<Set<string>>(new Set());

  // Stable join key of the inchi_keys present, so the effect re-runs only when
  // the set of structures changes.
  const keys = substances
    .map((s) => s.inchi_key)
    .filter(Boolean)
    .join(",");

  useEffect(() => {
    if (!enabled) return;
    const pending = substances.filter((s) => s.inchi_key && !requested.current.has(s.inchi_key));
    if (pending.length === 0) return;

    pending.forEach((s) => requested.current.add(s.inchi_key));
    setStates((prev) => {
      const next = new Map(prev);
      pending.forEach((s) => next.set(s.inchi_key, { state: "loading", data: null }));
      return next;
    });

    let cancelled = false;
    (async () => {
      for (let i = 0; i < pending.length; i += BATCH_MAX) {
        const chunk = pending.slice(i, i + BATCH_MAX);
        try {
          const { results } = await postPubChemEnrich(
            chunk.map((s) => ({ inchi_key: s.inchi_key, smiles: s.smiles })),
          );
          if (cancelled) return;
          setStates((prev) => {
            const next = new Map(prev);
            chunk.forEach((s) => {
              const data = results[s.inchi_key] ?? null;
              next.set(s.inchi_key, { state: data ? "success" : "error", data });
            });
            return next;
          });
        } catch {
          if (cancelled) return;
          setStates((prev) => {
            const next = new Map(prev);
            chunk.forEach((s) => next.set(s.inchi_key, { state: "error", data: null }));
            return next;
          });
          // Allow a later retry for this chunk.
          chunk.forEach((s) => requested.current.delete(s.inchi_key));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, keys]);

  return states;
}

/**
 * Tier-2 single-compound detail. Fetches when enabled + inchiKey present;
 * used by the StructureDetail panel on open.
 */
export function usePubChemCompound(inchiKey: string | undefined): PubChemCardState {
  const { enabled } = usePubChemPreferences();
  const [fetchState, setFetchState] = useState<PubChemCardState>({
    state: "idle",
    data: null,
  });

  const active = enabled && !!inchiKey;

  useEffect(() => {
    if (!active || !inchiKey) return;
    let cancelled = false;
    // Genuine async-fetch effect: flag loading, then resolve from the network.
    // This is the external-source sync the repo allows (see App.tsx), not a
    // render-derivable update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetchState({ state: "loading", data: null });
    getPubChemCompound(inchiKey)
      .then((data) => {
        if (!cancelled) setFetchState({ state: "success", data });
      })
      .catch(() => {
        if (!cancelled) setFetchState({ state: "error", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [active, inchiKey]);

  // When disabled / no key, return a derived idle — no setState in the effect
  // for the inactive case (the effect stays purely for the async fetch).
  return active ? fetchState : { state: "idle", data: null };
}
