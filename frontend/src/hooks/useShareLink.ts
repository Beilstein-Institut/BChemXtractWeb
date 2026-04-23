/**
 * useShareLink — copy a structure share URL to the clipboard (Phase 3 Task 14).
 *
 * Builds a deep-link of the form `${origin}/browse#s=<urlencoded-inchikey>`
 * so a recipient opening the link can be routed to the same substance. The
 * hook wraps the clipboard call, flips `shared = true` for 2 s after a
 * successful copy (so callers can render a "Copied" hint), and cleans up
 * its timeout on unmount.
 *
 * Factored out of `StructureCard` — the Task 9 review flagged the inline
 * `setTimeout` as a potential leak when the card unmounts mid-flash. That
 * leak is handled here by the effect-level cleanup.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { safeClipboardText } from "@/lib/safeStrings";

export interface UseShareLinkResult {
  /** True for ~2 s after a successful copy — drives the "Copied!" UI state. */
  shared: boolean;
  /**
   * Copy the share URL for the supplied InChI key. A falsy key is a no-op
   * (caller doesn't need to pre-guard). Resolves once the clipboard write
   * completes (or immediately on no-op / failure).
   */
  share: (key: string | null | undefined) => Promise<void>;
}

/** Build the share URL — exported so consumers/tests can assert on shape. */
export function buildShareUrl(
  origin: string,
  inchiKey: string,
  path = "/browse",
): string {
  return `${origin}${path}#s=${encodeURIComponent(inchiKey)}`;
}

const COPIED_FLAG_MS = 2000;

/**
 * Hook: copy a share URL for a given InChI key and surface a transient
 * "shared" flag. See module docstring for the URL shape.
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

  const share = useCallback(
    async (key: string | null | undefined): Promise<void> => {
      if (!key) return;
      const url = buildShareUrl(window.location.origin, key);
      // Let the promise reject naturally so callers can surface a toast /
      // fallback UI. The hook owns the "shared" flag + its cleanup timer,
      // but it does not own the user-facing error affordance — keeping that
      // decision at the call site preserves reusability (some contexts may
      // want a silent no-op, others a visible error).
      await navigator.clipboard.writeText(safeClipboardText(url));
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      setShared(true);
      timerRef.current = window.setTimeout(() => {
        setShared(false);
        timerRef.current = null;
      }, COPIED_FLAG_MS);
    },
    [],
  );

  return { shared, share };
}
