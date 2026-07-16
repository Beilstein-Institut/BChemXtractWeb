/**
 * useShareLink — copy a public PubChem link for a structure to the clipboard
 * and open it in a new tab.
 *
 * The structures live in a per-session, RLS-scoped database with no user
 * accounts, so an internal deep-link only works for the owner's own browser —
 * useless to send to anyone else. Instead we share a link to PubChem, a public
 * resource any recipient can open:
 *
 *   - real InChIKey (exact, precise lookup) when the structure has a real
 *     InChI; without one the stored inchi_key is empty, so
 *   - fall back to a SMILES structure search.
 *
 * The hook opens the link in a new tab, wraps the clipboard call, flips
 * `shared = true` for 2 s after a successful copy (so callers can render a
 * "Copied" hint), and cleans up its timeout on unmount.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { copyText } from "@/lib/clipboard";
import { isRealInchiKey } from "@/lib/inchi";

/** The structure identity needed to build a PubChem link. */
export interface ShareTarget {
  inchiKey?: string | null;
  smiles?: string | null;
}

export interface UseShareLinkResult {
  /** True for ~2 s after a successful copy — drives the "Copied!" UI state. */
  shared: boolean;
  /**
   * Copy a PubChem link for the supplied structure. A target with neither a
   * real InChIKey nor a SMILES is a no-op (caller needn't pre-guard). Resolves
   * once the clipboard write completes (or immediately on no-op).
   */
  share: (target: ShareTarget) => Promise<void>;
}

const PUBCHEM_QUERY_BASE = "https://pubchem.ncbi.nlm.nih.gov/#query=";

/**
 * Build a public PubChem URL for a structure, or null when it can't be
 * resolved (no real key and no SMILES). Exported so callers/tests can assert
 * on the shape and disable the affordance when null.
 */
export function buildPubChemShareUrl(target: ShareTarget): string | null {
  const { inchiKey, smiles } = target;
  // Prefer a real InChIKey (exact lookup). An InChI-less structure has an empty
  // key (fails isRealInchiKey), so fall back to a SMILES structure search.
  if (inchiKey && isRealInchiKey(inchiKey)) {
    return `${PUBCHEM_QUERY_BASE}${encodeURIComponent(inchiKey)}`;
  }
  if (smiles) {
    return `${PUBCHEM_QUERY_BASE}${encodeURIComponent(smiles)}`;
  }
  return null;
}

const COPIED_FLAG_MS = 2000;

/**
 * Hook: copy a PubChem link for a structure and surface a transient "shared"
 * flag. See module docstring for which URL shape is produced.
 */
export function useShareLink(): UseShareLinkResult {
  const [shared, setShared] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Cancel a pending "unset shared" timer on unmount so we never hit
    // React's "can't update state on an unmounted component" warning.
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const share = useCallback(async (target: ShareTarget): Promise<void> => {
    const url = buildPubChemShareUrl(target);
    if (!url) return;
    // Open PubChem in a new tab as well as copying the link. Do it here,
    // synchronously before the awaited clipboard write, so it runs inside the
    // click's user-activation window and pop-up blockers let it through.
    // noopener/noreferrer keeps the new tab from reaching back into this app.
    window.open(url, "_blank", "noopener,noreferrer");
    // Let the promise reject naturally so callers can surface a toast /
    // fallback UI. The hook owns the "shared" flag + its cleanup timer,
    // but it does not own the user-facing error affordance — keeping that
    // decision at the call site preserves reusability.
    await copyText(url);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    setShared(true);
    timerRef.current = window.setTimeout(() => {
      setShared(false);
      timerRef.current = null;
    }, COPIED_FLAG_MS);
  }, []);

  return { shared, share };
}
