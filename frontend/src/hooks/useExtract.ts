import { useCallback, useState } from "react";
import { postExtract } from "@/lib/apiClient";
import type { ExtractionResponse } from "@/types/chemistry";

export type ExtractState = "idle" | "loading" | "success" | "error";

export interface UseExtractReturn {
  state: ExtractState;
  result: ExtractionResponse | null;
  errorMessage: string | null;
  extract: (file: File) => Promise<void>;
  reset: () => void;
}

/**
 * Upload state machine for single-file CDX/CDXML extraction.
 * States: idle -> loading -> success | error
 * Call reset() to return to idle from any state.
 *
 * Note: The JVM singleton constraint means extraction is stateless per request —
 * the backend handles one file at a time. This hook mirrors that: one active
 * extraction at a time, reset() to clear and start again.
 */
export function useExtract(): UseExtractReturn {
  const [state, setState] = useState<ExtractState>("idle");
  const [result, setResult] = useState<ExtractionResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const extract = useCallback(async (file: File) => {
    setState("loading");
    setResult(null);
    setErrorMessage(null);
    try {
      const data = await postExtract(file);
      setResult(data);
      setState("success");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Extraction failed for an unknown reason.",
      );
      setState("error");
    }
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setResult(null);
    setErrorMessage(null);
  }, []);

  return { state, result, errorMessage, extract, reset };
}
