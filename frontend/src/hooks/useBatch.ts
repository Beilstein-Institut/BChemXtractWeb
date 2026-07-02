import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { cancelBatch as apiCancelBatch, getBatchSSEUrl, postBatchStart } from "@/lib/apiClient";
import type { BatchFileStatus, FileCompleteEvent } from "@/types/batch";

/**
 * Runtime guard for the SSE ``file_complete`` payload.
 *
 * ``JSON.parse`` returns ``unknown``; a compile-time ``as`` cast is a
 * promise to the reader, not a runtime check. A server-side protocol
 * drift or malformed frame must not crash the handler or land
 * unexpected types in React state.
 */
function isFileCompleteEvent(x: unknown): x is FileCompleteEvent {
  if (!x || typeof x !== "object") return false;
  const r = (x as { result?: unknown }).result;
  if (!r || typeof r !== "object") return false;
  const res = r as Record<string, unknown>;
  return (
    typeof res.filename === "string" &&
    (res.error === null || res.error === undefined || typeof res.error === "string") &&
    (res.extraction_id === null ||
      res.extraction_id === undefined ||
      typeof res.extraction_id === "number") &&
    typeof res.structure_count === "number"
  );
}

export type BatchState = "idle" | "processing" | "complete" | "error" | "cancelled";

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
  /** Cancel pending tasks (current task completes) */
  cancelBatch: () => Promise<void>;
  /** Reset to idle — allows starting a new batch */
  reset: () => void;
  /**
   * The original uploaded File for a completed batch extraction, or null if
   * this id isn't from the current batch. Lets the Reactions tab extract
   * on-demand from bytes still in memory instead of forcing a re-upload.
   * Session-scoped: cleared by reset() and replaced by the next startBatch().
   */
  getUploadedFile: (extractionId: number) => File | null;
}

/**
 * Batch lifecycle state machine for multi-file CDX/CDXML extraction.
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
  const [groupId, setGroupId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  // Original File objects from this batch, keyed by filename (the same key the
  // SSE file_complete handler matches on). Held in a ref so retaining the bytes
  // doesn't trigger re-renders; joined with `files` (which carries the
  // extractionId) in getUploadedFile.
  const filesByNameRef = useRef<Map<string, File>>(new Map());

  const completedCount = files.filter((f) => f.state === "done").length;
  const failedCount = files.filter((f) => f.state === "failed").length;
  const totalStructures = files.reduce(
    (sum, f) => sum + (f.state === "done" ? f.structureCount : 0),
    0,
  );

  const closeSSE = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  const handleFileComplete = useCallback((event: MessageEvent) => {
    // Runtime-validate the SSE payload shape rather than
    // trusting the compile-time `as FileCompleteEvent` cast. Malformed
    // payloads are dropped silently — the UI stays on the last known
    // good state rather than crashing the handler.
    let data: unknown;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!isFileCompleteEvent(data)) return;

    const { filename, error, structure_count, extraction_id } = data.result;
    setFiles((prev) =>
      prev.map((f) => {
        if (f.filename !== filename) return f;
        if (error) {
          return {
            state: "failed",
            filename: f.filename,
            fileSize: f.fileSize,
            error,
          };
        }
        return {
          state: "done",
          filename: f.filename,
          fileSize: f.fileSize,
          structureCount: structure_count,
          extractionId: extraction_id,
        };
      }),
    );
  }, []);

  const startBatch = useCallback(
    async (inputFiles: File[]) => {
      setState("processing");
      setErrorMessage(null);

      // Retain the uploaded bytes for this session so the Reactions tab can
      // extract on-demand without a re-upload. Replaces any prior batch's files.
      filesByNameRef.current = new Map(inputFiles.map((f) => [f.name, f]));

      // Initialise per-file status list in queued state.
      setFiles(
        inputFiles.map((f) => ({
          state: "queued",
          filename: f.name,
          fileSize: f.size,
        })),
      );

      let startResponse;
      try {
        startResponse = await postBatchStart(inputFiles);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Batch start failed for an unknown reason.",
        );
        setState("error");
        return;
      }

      setBatchId(startResponse.batch_id);
      setGroupId(startResponse.group_id);

      // SSE and cancel use group_id (Celery GroupResult), ZIP uses
      // batch_id (DB UUID).
      const es = new EventSource(getBatchSSEUrl(startResponse.group_id));
      esRef.current = es;
      es.addEventListener("file_complete", handleFileComplete);
      es.addEventListener("batch_complete", () => {
        closeSSE();
        setState("complete");
      });
      es.addEventListener("error", () => {
        closeSSE();
        setErrorMessage("Live progress dropped. Reload the page to recover.");
        setState("error");
        toast.error("Live progress dropped. Reload to retry.");
      });
    },
    [closeSSE, handleFileComplete],
  );

  const cancelBatch = useCallback(async () => {
    if (groupId) {
      try {
        await apiCancelBatch(groupId);
      } catch {
        // The stop request didn't reach the server, so the batch may still be
        // running and its results not deleted. Don't claim it stopped — keep
        // the live progress visible and tell the user to retry.
        toast.error("Couldn't reach the server to stop the batch. Reload the page to retry.");
        return;
      }
    }
    // Stop confirmed by the server (batch cancelled, partial results deleted).
    closeSSE();
    setState("cancelled");
  }, [groupId, closeSSE]);

  const reset = useCallback(() => {
    closeSSE();
    setState("idle");
    setFiles([]);
    setBatchId(null);
    setGroupId(null);
    setErrorMessage(null);
    filesByNameRef.current = new Map();
  }, [closeSSE]);

  const getUploadedFile = useCallback(
    (extractionId: number): File | null => {
      const match = files.find((f) => f.state === "done" && f.extractionId === extractionId);
      if (!match) return null;
      return filesByNameRef.current.get(match.filename) ?? null;
    },
    [files],
  );

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
    getUploadedFile,
  };
}
