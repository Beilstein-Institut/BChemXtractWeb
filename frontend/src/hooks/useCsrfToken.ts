import { useCallback, useEffect, useState } from "react";
import { getCsrfToken } from "@/lib/apiClient";
import { csrfTokenCache } from "@/lib/csrfTokenCache";

export interface UseCsrfTokenReturn {
  isReady: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Boot-time CSRF token bootstrap (Phase 11 D-19).
 *
 * Writes the freshly-fetched token into the module-level `csrfTokenCache`
 * so `apiClient.apiFetch` picks it up on every state-changing request.
 *
 * `apiClient` ALSO handles 403/CSRF_INVALID retries internally by re-fetching
 * the token via `refreshCsrfToken`; this hook only owns the initial fetch
 * plus an optional manual `refresh()` callback (e.g. after a long idle).
 */
export function useCsrfToken(): UseCsrfTokenReturn {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getCsrfToken();
      csrfTokenCache.value = data.csrf_token;
      setIsReady(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSRF token fetch failed");
      setIsReady(false);
    }
  }, []);

  // why: refresh() bootstraps a token from an external system (the
  //      backend's GET /api/csrf-token). The setState calls inside refresh
  //      sync the network result into React — the pattern
  //      react-hooks/set-state-in-effect explicitly allows. The
  //      catch branch setError flagged synchronously is acceptable for a
  //      one-shot bootstrap that fires once per refresh-identity.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refresh();
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { isReady, error, refresh };
}
