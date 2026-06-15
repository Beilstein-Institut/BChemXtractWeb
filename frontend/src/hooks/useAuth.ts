import { useCallback, useEffect, useState } from "react";
import { putAuthMe } from "@/lib/apiClient";
import type { SessionInfoResponse } from "@/types/auth";

export interface UseAuthReturn {
  sessionId: string | null;
  hasHistory: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Boot-time session bootstrap.
 *
 * Calls `PUT /api/auth/me` on mount, which causes the backend to issue a
 * fresh `bcx_sid` cookie when none is present. The response carries the
 * `session_id` (rendered on the Settings page as the recovery code) and
 * `has_history` (drives the "0 extractions yet" empty-state UX).
 *
 * The hook is also called from the Settings page so the recovery code
 * stays in sync when the user has just restored from a code (which
 * changes `session_id` on the cookie).
 */
export function useAuth(): UseAuthReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hasHistory, setHasHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data: SessionInfoResponse = await putAuthMe();
      setSessionId(data.session_id);
      setHasHistory(data.has_history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Session bootstrap failed");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // why: refresh() bootstraps the cookie session from an external system
  //      (the backend's PUT /api/auth/me endpoint). The setState calls
  //      inside refresh sync the network result into React — which is the
  //      pattern react-hooks/set-state-in-effect explicitly allows
  //      ("subscribe for updates from some external system"). The lint
  //      rule does flag the sync setIsLoading(true) at the top of refresh
  //      as a cascading-render risk; in practice the effect fires exactly
  //      once per render-identity-stable refresh() and the extra render
  //      is acceptable for a one-shot bootstrap.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refresh();
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { sessionId, hasHistory, isLoading, error, refresh };
}
