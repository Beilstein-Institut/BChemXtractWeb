import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactionExtractionResponse } from "@/types/chemistry";
import { postReactions } from "@/lib/apiClient";

export type ReactionsState = "idle" | "loading" | "success" | "error";

export interface UseReactionsReturn {
  state: ReactionsState;
  result: ReactionExtractionResponse | null;
  errorMessage: string | null;
  extract: (file: File) => Promise<void>;
  reset: () => void;
}

/**
 * Plan 10 D-04 + Pitfall 10: hook for POST /api/reactions.
 *
 * Mirrors the useExtract state machine (idle → loading → success | error) but
 * layers an AbortController on every extract() call so rapid re-clicks (or a
 * tab switch that unmounts this hook) cancel prior in-flight requests. This
 * matches the useSearch cancellation posture and prevents React dev-mode
 * warnings about setting state on an unmounted component.
 *
 * D-06 timeout semantics: a 200 response with `reactions: []` and
 * non-empty `warnings` is delivered to `result` with `state === "success"`.
 * Callers inspect `result.warnings` to surface timeout toasts (UI-SPEC §3b).
 */
export function useReactions(): UseReactionsReturn {
  const [state, setState] = useState<ReactionsState>("idle");
  const [result, setResult] = useState<ReactionExtractionResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Clean up on unmount: abort any in-flight request.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const extract = useCallback(async (file: File) => {
    // Cancel any prior in-flight request so results from stale calls don't
    // race the latest one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState("loading");
    setResult(null);
    setErrorMessage(null);
    try {
      const data = await postReactions(file, controller.signal);
      // If still the active controller (not superseded), commit result.
      if (abortRef.current === controller) {
        setResult(data);
        setState("success");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Aborted by newer extract() call or unmount — do NOT set error state.
        return;
      }
      if (abortRef.current === controller) {
        const msg =
          err instanceof Error
            ? err.message
            : "An unexpected error occurred.";
        setErrorMessage(msg);
        setState("error");
      }
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState("idle");
    setResult(null);
    setErrorMessage(null);
  }, []);

  return { state, result, errorMessage, extract, reset };
}
