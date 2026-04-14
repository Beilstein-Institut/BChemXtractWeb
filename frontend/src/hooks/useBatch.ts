import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { BatchFileStatus } from "@/types/batch";
import type { FileCompleteEvent } from "@/types/batch";
import {
  postBatchStart,
  getBatchSSEUrl,
  cancelBatch as apiCancelBatch,
} from "@/lib/apiClient";

export type BatchState =
  | "idle"
  | "processing"
  | "complete"
  | "error"
  | "cancelled";

export interface UseBatchReturn {
  /** Lifecycle state of the batch */
  state: BatchState;
  /** Per-file statuses (populated once startBatch is called) */
  files: BatchFileStatus[];
  /** Celery GroupResult.id — null until startBatch resolves */
  batchId: string | null;
  /** Number of files in state "done" */
  completedCount: number;
  /** Number of files in state "failed" */
  failedCount: number;
  /** Total structures across all done files */
  totalStructures: number;
  /** Error message if state === "error" */
  errorMessage: string | null;
  /** Start a new batch with the given files */
  startBatch: (files: File[]) => Promise<void>;
  /** Cancel pending tasks (current task completes, D-10) */
  cancelBatch: () => Promise<void>;
  /** Reset to idle — allows starting a new batch (D-04) */
  reset: () => void;
}

/**
 * Batch lifecycle state machine for multi-file CDX/CDXML extraction (Phase 7).
 *
 * States: idle -> processing -> complete | error | cancelled
 * Call reset() to return to idle from any terminal state.
 *
 * Uses browser-native EventSource (no npm package) for SSE consumption.
 * JVM singleton constraint: processing is serialized by Celery solo worker.
 */
export function useBatch(): UseBatchReturn {
  const [state, setState] = useState<BatchState>("idle");
  const [files, setFiles] = useState<BatchFileStatus[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const completedCount = files.filter((f) => f.state === "done").length;
  const failedCount = files.filter((f) => f.state === "failed").length;
  const totalStructures = files.reduce(
    (sum, f) => sum + (f.state === "done" ? f.structureCount : 0),
    0
  );

  const _closeSSE = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const startBatch = useCallback(
    async (inputFiles: File[]) => {
      setState("processing");
      setErrorMessage(null);

      // Initialize per-file status list in queued state
      setFiles(
        inputFiles.map((f) => ({
          state: "queued" as const,
          filename: f.name,
          fileSize: f.size,
        }))
      );

      let startResponse;
      try {
        startResponse = await postBatchStart(inputFiles);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Batch start failed.";
        setErrorMessage(msg);
        setState("error");
        return;
      }

      const id = startResponse.batch_id;
      setBatchId(id);

      // Open SSE connection using browser-native EventSource
      const es = new EventSource(getBatchSSEUrl(id));
      esRef.current = es;

      es.addEventListener("file_complete", (e: MessageEvent) => {
        const data = JSON.parse(e.data) as FileCompleteEvent;
        setFiles((prev) =>
          prev.map((f) => {
            if (f.filename !== data.result.filename) return f;
            if (data.result.error) {
              return {
                state: "failed" as const,
                filename: f.filename,
                fileSize: f.fileSize,
                error: data.result.error,
              };
            }
            return {
              state: "done" as const,
              filename: f.filename,
              fileSize: f.fileSize,
              structureCount: data.result.structure_count,
              extractionId: data.result.extraction_id,
            };
          })
        );
      });

      es.addEventListener("batch_complete", () => {
        _closeSSE();
        setState("complete");
      });

      es.addEventListener("error", () => {
        _closeSSE();
        setErrorMessage("Connection lost.");
        setState("error");
        toast.error("Connection lost. Reconnecting…");
      });
    },
    [_closeSSE]
  );

  const cancelBatch = useCallback(async () => {
    _closeSSE();
    if (batchId) {
      try {
        await apiCancelBatch(batchId);
      } catch {
        // Best-effort cancel
      }
    }
    setState("cancelled");
  }, [batchId, _closeSSE]);

  const reset = useCallback(() => {
    _closeSSE();
    setState("idle");
    setFiles([]);
    setBatchId(null);
    setErrorMessage(null);
  }, [_closeSSE]);

  return {
    state,
    files,
    batchId,
    completedCount,
    failedCount,
    totalStructures,
    errorMessage,
    startBatch,
    cancelBatch,
    reset,
  };
}
