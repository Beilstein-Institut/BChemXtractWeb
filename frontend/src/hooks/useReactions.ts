import { useCallback, useEffect, useRef, useState } from "react";
import { postReactions } from "@/lib/apiClient";
import type { ReactionExtractionResponse } from "@/types/chemistry";

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

  // Abort any in-flight request on unmount so state doesn't settle
  // after the hook instance is gone.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const extract = useCallback(async (file: File) => {
    // Cancel any prior in-flight request so stale results never
    // supersede the latest call.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState("loading");
    setResult(null);
    setErrorMessage(null);
    try {
      const data = await postReactions(file, controller.signal);
      if (abortRef.current !== controller) return;
      setResult(data);
      setState("success");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (abortRef.current !== controller) return;
      setErrorMessage(err instanceof Error ? err.message : "Reaction extraction failed for an unknown reason.");
      setState("error");
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
