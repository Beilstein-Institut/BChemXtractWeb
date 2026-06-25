import { useEffect, useMemo, useRef, useState } from "react";
import { getPubChemCompound, postPubChemEnrich } from "@/lib/apiClient";
import { isRealInchiKey } from "@/lib/inchi";
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
  const { enabled, available } = usePubChemPreferences();
  const active = enabled && available;
  const [states, setStates] = useState<Map<string, PubChemCardState>>(new Map());
  const requested = useRef<Set<string>>(new Set());

  // Stable join key of the REAL inchi_keys present, so the effect re-runs only
  // when the set of enrichable structures changes. Surrogate keys (from
  // InChI-less structures) are excluded — PubChem's batch endpoint 422s the
  // whole request on any non-InChIKey-shaped key. Memoized so the regex pass +
  // join don't repeat on unrelated re-renders.
  const keys = useMemo(
    () =>
      substances
        .map((s) => s.inchi_key)
        .filter(isRealInchiKey)
        .join(","),
    [substances],
  );

  useEffect(() => {
    if (!active) return;
    // Capture the stable ref Set once. It is never reassigned (only mutated),
    // so this local points to the same Set in the cleanup — satisfying the
    // exhaustive-deps ref-in-cleanup guard while staying correct.
    const req = requested.current;
    const pending = substances.filter((s) => isRealInchiKey(s.inchi_key) && !req.has(s.inchi_key));
    if (pending.length === 0) return;

    pending.forEach((s) => req.add(s.inchi_key));
    setStates((prev) => {
      const next = new Map(prev);
      pending.forEach((s) => next.set(s.inchi_key, { state: "loading", data: null }));
      return next;
    });

    let cancelled = false;
    const settled = new Set<string>();
    (async () => {
      for (let i = 0; i < pending.length; i += BATCH_MAX) {
        const chunk = pending.slice(i, i + BATCH_MAX);
        try {
          const { results } = await postPubChemEnrich(
            chunk.map((s) => ({ inchi_key: s.inchi_key, smiles: s.smiles })),
          );
          if (cancelled) return;
          chunk.forEach((s) => settled.add(s.inchi_key));
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
          chunk.forEach((s) => settled.add(s.inchi_key));
          setStates((prev) => {
            const next = new Map(prev);
            chunk.forEach((s) => next.set(s.inchi_key, { state: "error", data: null }));
            return next;
          });
          // Allow a later retry for this chunk.
          chunk.forEach((s) => req.delete(s.inchi_key));
        }
      }
    })();

    return () => {
      cancelled = true;
      // Keys that never settled (request cancelled mid-flight by a list
      // change) are still marked "loading". Drop them from the dedup set so a
      // later run re-requests them — otherwise they stay on the loading
      // skeleton forever.
      pending.forEach((s) => {
        if (!settled.has(s.inchi_key)) req.delete(s.inchi_key);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, keys]);

  return states;
}

/**
 * Tier-2 single-compound detail. Fetches when enabled + inchiKey present;
 * used by the StructureDetail panel on open.
 */
export function usePubChemCompound(inchiKey: string | undefined): PubChemCardState {
  const { enabled, available } = usePubChemPreferences();
  const [fetchState, setFetchState] = useState<PubChemCardState>({
    state: "idle",
    data: null,
  });

  const active = enabled && available && !!inchiKey;

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
