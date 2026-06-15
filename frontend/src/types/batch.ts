/**
 * TypeScript types for batch processing.
 * Maps to POST /api/batch and GET /api/batch/{id}/progress SSE events.
 */

/** Response from POST /api/batch */
export interface BatchStartResponse {
  /** UUID stored on each Extraction row — used for ZIP download */
  batch_id: string;
  /** Celery GroupResult.id — used for SSE progress and cancel */
  group_id: string;
  task_ids: string[];
  file_count: number;
}

/** SSE payload for event: "file_complete" */
export interface FileCompleteEvent {
  task_id: string;
  state: "SUCCESS" | "FAILURE";
  result: {
    filename: string;
    structure_count: number;
    extraction_id: number | null;
    error: string | null;
  };
}

/** SSE payload for event: "batch_complete" */
export interface BatchCompleteEvent {
  batch_id: string;
}

/** Per-file status in the batch queue and progress views */
export type BatchFileStatus =
  | { state: "queued"; filename: string; fileSize: number }
  | { state: "processing"; filename: string; fileSize: number }
  | {
      state: "done";
      filename: string;
      fileSize: number;
      structureCount: number;
      extractionId: number | null;
    }
  | { state: "failed"; filename: string; fileSize: number; error: string };

/** Summary computed from completed batch */
export interface BatchSummary {
  totalFiles: number;
  totalStructures: number;
  succeededCount: number;
  failedCount: number;
  processingTimeMs: number;
}
