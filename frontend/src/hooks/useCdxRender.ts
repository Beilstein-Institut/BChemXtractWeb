import { useCallback, useRef, useState } from "react";
import { ApiError, getRenderedCdx } from "@/lib/apiClient";

export type CdxRenderState = "idle" | "loading" | "success" | "error";

export interface UseCdxRenderReturn {
  /** Lifecycle state of the render request. */
  state: CdxRenderState;
  /** Raw SVG markup once state === "success"; null otherwise. */
  svg: string | null;
  /** Backend error code (e.g. "FILE_NOT_STORED") when state === "error". */
  errorCode: string | null;
  /** Fetch the faithful SVG for an extraction's stored CDX. */
  render: (extractionId: number) => void;
  /** Reset to idle — allows starting a new render. */
  reset: () => void;
}

/**
 * State machine wrapping `getRenderedCdx` (GET
 * /api/extractions/{id}/render.svg).
 *
 * States: idle -> loading -> success | error. Call reset() to return to
 * idle from either terminal state.
 *
 * A request counter guards against out-of-order responses: if render() is
 * called again before an earlier call resolves, the earlier call's result
 * is dropped when it eventually settles rather than clobbering the newer
 * state (mirrors the AbortController-free stale-guard pattern used where
 * cancellation isn't available — reads have no server-side work to cancel).
 */
export function useCdxRender(): UseCdxRenderReturn {
  const [state, setState] = useState<CdxRenderState>("idle");
  const [svg, setSvg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const render = useCallback((extractionId: number) => {
    const requestId = ++requestIdRef.current;
    setState("loading");
    setSvg(null);
    setErrorCode(null);

    getRenderedCdx(extractionId)
      .then((markup) => {
        if (requestId !== requestIdRef.current) return; // superseded by a later render()
        setSvg(markup);
        setState("success");
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return; // superseded by a later render()
        setErrorCode(err instanceof ApiError ? (err.code ?? null) : null);
        setState("error");
      });
  }, []);

  const reset = useCallback(() => {
    // Bump the counter so any still-in-flight request from before the reset
    // can no longer land its result.
    requestIdRef.current++;
    setState("idle");
    setSvg(null);
    setErrorCode(null);
  }, []);

  return { state, svg, errorCode, render, reset };
}
