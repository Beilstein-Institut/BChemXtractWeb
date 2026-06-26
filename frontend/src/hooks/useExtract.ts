import { useCallback, useRef, useState } from "react";
import {
  type ExtractJobStatus,
  getExtractJobStatus,
  getHistoryDetail,
  postExtractJob,
} from "@/lib/apiClient";
import type { ExtractionResponse } from "@/types/chemistry";

export type ExtractState = "idle" | "loading" | "success" | "error";

export interface UseExtractReturn {
  state: ExtractState;
  result: ExtractionResponse | null;
  errorMessage: string | null;
  extract: (file: File) => Promise<void>;
  reset: () => void;
}

const POLL_INTERVAL_MS = 1000;
// The worker caps a single extraction at ~120s (30s stage-1 + 90s fallback).
// Allow margin for the job to queue behind other work on the solo worker
// before we give up and tell the user to retry.
const POLL_TIMEOUT_MS = 180_000;
// Tolerate transient poll failures (5xx, network blip, a 429 from the shared
// limiter) — the worker is still running, so a single failed status check must
// not kill the job. Give up only after this many in a row.
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

/** Promise that resolves after `ms`, or rejects (AbortError) if `signal` aborts first. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Upload state machine for single-file CDX/CDXML extraction.
 * States: idle -> loading -> success | error. Call reset() to return to idle.
 *
 * Extraction is asynchronous: the file is submitted to the backend worker
 * (returns immediately), then the hook polls for completion and loads the
 * full result. This keeps the HTTP requests short, so an upstream proxy or
 * gateway can never time out a long-held extraction connection. The return
 * shape is unchanged — callers see the same idle/loading/success/error flow.
 *
 * reset() (and a superseding extract() call) aborts any in-flight polling via
 * an AbortController so a stale job can't clobber a newer run's state.
 */
export function useExtract(): UseExtractReturn {
  const [state, setState] = useState<ExtractState>("idle");
  const [result, setResult] = useState<ExtractionResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const extract = useCallback(async (file: File) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setState("loading");
    setResult(null);
    setErrorMessage(null);

    try {
      const { task_id } = await postExtractJob(file);
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let consecutivePollErrors = 0;

      for (;;) {
        if (signal.aborted) return;

        let status: ExtractJobStatus;
        try {
          status = await getExtractJobStatus(task_id);
          consecutivePollErrors = 0;
        } catch (err) {
          // Submit already succeeded and the worker keeps running, so a
          // transient status-check failure must not abort the extraction.
          // Retry until the errors persist or we hit the deadline.
          if (signal.aborted) return;
          consecutivePollErrors += 1;
          if (consecutivePollErrors >= MAX_CONSECUTIVE_POLL_ERRORS || Date.now() > deadline) {
            throw err;
          }
          await delay(POLL_INTERVAL_MS, signal);
          continue;
        }

        if (status.state === "done") {
          // "done" is always terminal. A null id means the job ended without a
          // persisted result (e.g. revoked) — surface it instead of polling on.
          if (status.extraction_id == null) {
            throw new Error("Extraction finished but produced no result. Please try again.");
          }
          const full = await getHistoryDetail(status.extraction_id);
          if (signal.aborted) return;
          setResult(full);
          setState("success");
          return;
        }
        if (status.state === "failed") {
          throw new Error(status.error || "Extraction failed.");
        }
        if (Date.now() > deadline) {
          throw new Error("Extraction is taking longer than expected. Please try again.");
        }
        await delay(POLL_INTERVAL_MS, signal);
      }
    } catch (err) {
      // A superseding extract() / reset() aborts this run; swallow silently so
      // it doesn't surface as an error toast.
      if (signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        return;
      }
      setErrorMessage(
        err instanceof Error ? err.message : "Extraction failed for an unknown reason.",
      );
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
