/**
 * useShareTarget — resolve a `/browse#s=<inchikey>` share deep link.
 *
 * The share button (see {@link useShareLink}) copies a URL of the form
 * `${origin}/browse#s=<urlencoded-inchikey>`. This hook is the consumer: on
 * mount and on `hashchange` it reads the `#s=` hash, looks the InChI key up
 * via the scoped search API, and hands the resolved substance to `onResolve`
 * so the page can open it in the structure sheet.
 *
 * Resolution is RLS-scoped exactly like every other search: the link only
 * opens for a session that owns the structure. A link opened by a different
 * session (or after the data was removed) resolves to nothing and surfaces a
 * toast rather than silently dead-ending on an empty page.
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { postSearch } from "@/lib/apiClient";
import type { SubstanceResponse } from "@/types/chemistry";

const SHARE_HASH_PREFIX = "#s=";

/** Extract and decode the InChI key from a `#s=<key>` hash, or null. */
export function parseShareHash(hash: string): string | null {
  if (!hash.startsWith(SHARE_HASH_PREFIX)) return null;
  const raw = hash.slice(SHARE_HASH_PREFIX.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** Remove the `#s=` hash from the URL without reloading (e.g. on sheet close). */
export function clearShareHash(): void {
  if (window.location.hash.startsWith(SHARE_HASH_PREFIX)) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

/**
 * Resolve the current `#s=` share hash and call `onResolve` with the matched
 * substance. Re-runs whenever the hash changes.
 */
export function useShareTarget(onResolve: (substance: SubstanceResponse) => void): void {
  // Keep the latest callback without making it an effect dependency, so the
  // hashchange listener is registered once.
  const onResolveRef = useRef(onResolve);
  useEffect(() => {
    onResolveRef.current = onResolve;
  }, [onResolve]);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const key = parseShareHash(window.location.hash);
      if (!key) return;
      try {
        const res = await postSearch({ query: key, type: "inchi_key", scope: "global" });
        if (cancelled) return;
        const match = res.results[0]?.substance;
        if (match) {
          onResolveRef.current(match);
        } else {
          toast.error(
            "Shared structure not found — it may belong to another session or have been removed.",
          );
        }
      } catch {
        if (!cancelled) {
          toast.error("Couldn't open the shared structure. Please try again.");
        }
      }
    }

    void resolve();
    const onHashChange = () => void resolve();
    window.addEventListener("hashchange", onHashChange);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);
}
