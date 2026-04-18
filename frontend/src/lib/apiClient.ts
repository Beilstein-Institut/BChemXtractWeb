import type {
  ExtractionResponse,
  PagedSubstancesResponse,
  ReactionExtractionResponse,
} from "@/types/chemistry";
import type { HistoryListResponse, StatsResponse } from "@/types/history";
import type { BatchStartResponse } from "@/types/batch";
import type { ExportRequest } from "@/types/export";
import type { SearchRequest, SearchResponse } from "@/types/search";

/**
 * POSTs a CDX/CDXML file to POST /api/extract using multipart/form-data.
 * Throws a descriptive Error on HTTP errors or network failure.
 *
 * Note: This function is called from the useExtract hook. It wraps fetch
 * and converts HTTP error responses and network failures into typed Errors
 * with human-readable messages for display in the UI.
 */
export async function postExtract(file: File): Promise<ExtractionResponse> {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch("/api/extract", {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error("Could not reach the extraction server — check your connection.");
  }

  if (!response.ok) {
    let detail = "please try again";
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // JSON parse failed — use default detail
    }
    throw new Error(`Extraction failed — ${detail}`);
  }

  const body = await response.json();
  if (!body || !Array.isArray(body.substances)) {
    throw new Error("Extraction failed — unexpected response format from server.");
  }
  return body as ExtractionResponse;
}

/**
 * Fetch extraction history list.
 * @param limit - Number of entries to fetch. Use "all" for no limit.
 */
export async function getHistory(limit: number | "all" = 10): Promise<HistoryListResponse> {
  const url = `/api/history?limit=${limit}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("Could not reach the server — check your connection.");
  }
  if (!response.ok) {
    throw new Error(`Failed to load history (${response.status})`);
  }
  return response.json() as Promise<HistoryListResponse>;
}

/**
 * Fetch the full extraction result for one history entry (HIST-02).
 * Returns the same ExtractionResponse shape as POST /api/extract.
 */
export async function getHistoryDetail(id: number): Promise<ExtractionResponse> {
  let response: Response;
  try {
    response = await fetch(`/api/history/${id}`);
  } catch {
    throw new Error("Could not reach the server — check your connection.");
  }
  if (!response.ok) {
    if (response.status === 404) throw new Error("Extraction not found.");
    throw new Error(`Failed to load extraction (${response.status})`);
  }
  return response.json() as Promise<ExtractionResponse>;
}

/**
 * Delete one history entry by id (D-07).
 * Throws on non-204 response.
 */
export async function deleteHistoryEntry(id: number): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/history/${id}`, { method: "DELETE" });
  } catch {
    throw new Error("Could not reach the server — check your connection.");
  }
  if (!response.ok && response.status !== 204) {
    throw new Error(`Could not delete extraction. Try again.`);
  }
}

/**
 * Fetch aggregate statistics (HIST-04, D-08).
 */
export async function getStats(): Promise<StatsResponse> {
  let response: Response;
  try {
    response = await fetch("/api/stats");
  } catch {
    throw new Error("Could not reach the server — check your connection.");
  }
  if (!response.ok) {
    throw new Error(`Failed to load statistics (${response.status})`);
  }
  return response.json() as Promise<StatsResponse>;
}

/**
 * Fetch one page of substances for a stored extraction (DISP-03, D-01).
 * @param extractionId - DB primary key from ExtractionResponse.extraction_id
 * @param page - 1-based page number
 * @param size - items per page (12 | 24 | 48)
 * @param sort - "extraction_order" | "formula"
 */
export async function getSubstancesPage(
  extractionId: number,
  page: number,
  size: 12 | 24 | 48,
  sort: "extraction_order" | "formula",
): Promise<PagedSubstancesResponse> {
  const url = `/api/extractions/${extractionId}/substances?page=${page}&size=${size}&sort=${sort}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("Could not reach the server — check your connection.");
  }
  if (!response.ok) {
    if (response.status === 404) throw new Error("Extraction not found.");
    throw new Error(`Failed to load structures (${response.status})`);
  }
  return response.json() as Promise<PagedSubstancesResponse>;
}

/**
 * POST /api/batch — start a batch extraction.
 * @param files - Array of File objects (max 20, max 50 MB each).
 * Returns BatchStartResponse with batch_id for progress tracking.
 */
export async function postBatchStart(files: File[]): Promise<BatchStartResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  let response: Response;
  try {
    response = await fetch("/api/batch", {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error("Could not reach the server — check your connection.");
  }

  if (!response.ok) {
    let detail = "please try again";
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // use default
    }
    throw new Error(`Batch start failed — ${detail}`);
  }

  return response.json() as Promise<BatchStartResponse>;
}

/**
 * Returns the SSE URL for batch progress (used with native EventSource).
 * @param batchId - batch_id from BatchStartResponse
 */
export function getBatchSSEUrl(batchId: string): string {
  return `/api/batch/${encodeURIComponent(batchId)}/progress`;
}

/**
 * DELETE /api/batch/{batchId} — cancel pending tasks (current task finishes, D-10).
 */
export async function cancelBatch(batchId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/batch/${encodeURIComponent(batchId)}`, {
      method: "DELETE",
    });
  } catch {
    throw new Error("Could not reach the server — check your connection.");
  }
  if (!response.ok) {
    throw new Error(`Could not cancel batch (${response.status})`);
  }
}

/**
 * GET /api/batch/{batchId}/zip — trigger ZIP download.
 * Creates a temporary anchor element to trigger browser download.
 * Throws if the fetch fails or returns non-ok.
 */
export async function downloadBatchZip(batchId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/batch/${encodeURIComponent(batchId)}/zip`);
  } catch {
    throw new Error("Could not reach the server — check your connection.");
  }
  if (!response.ok) {
    throw new Error(`ZIP download failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `batch_${batchId.slice(0, 8)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * POST /api/export — trigger chemical format export and download.
 *
 * POSTs JSON payload, receives a file blob (SDF, ZIP, JSON, CSV, etc.),
 * and triggers a browser download via temporary anchor element.
 * Reuses downloadBatchZip blob+anchor pattern (D-08).
 *
 * @param payload - ExportRequest with format and substance_ids or extraction_id
 * @param suggestedFilename - Browser download filename (backend also sends Content-Disposition)
 */
export async function postExport(payload: ExportRequest, suggestedFilename: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the server — check your connection.");
  }
  if (!response.ok) {
    let detail = "please try again";
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // use default
    }
    throw new Error(`Export failed — ${detail}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * POST /api/search — execute a structure search.
 *
 * Returns the parsed JSON response. Throws an Error on HTTP errors or
 * network failure. Error message pulls `body.detail` from the unified
 * ErrorResponse shape (Plan 05, D-17).
 */
export async function postSearch(payload: SearchRequest): Promise<SearchResponse> {
  let response: Response;
  try {
    response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the server — check your connection.");
  }
  if (!response.ok) {
    let detail = "please try again";
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // fall through to default
    }
    throw new Error(`Search failed — ${detail}`);
  }
  return response.json() as Promise<SearchResponse>;
}

/**
 * POST /api/reactions — experimental reaction extraction (Plan 10 D-02).
 *
 * Accepts a CDX/CDXML File + optional AbortSignal to cancel in-flight requests
 * (mirrors useSearch AbortController pattern; mitigates Pitfall 10 react
 * dev-mode warning about state updates on unmounted components).
 *
 * Per D-06: a 200 response may contain reactions=[] + warnings (timeout path).
 * Callers treat timeout as a non-error success state.
 */
export async function postReactions(
  file: File,
  signal?: AbortSignal,
): Promise<ReactionExtractionResponse> {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch("/api/reactions", {
      method: "POST",
      body: formData,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err; // propagate; caller decides how to handle
    }
    throw new Error(
      "Could not reach the reaction server — check your connection.",
    );
  }

  if (!response.ok) {
    let detail = "please try again";
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // JSON parse failed — use default detail
    }
    throw new Error(`Reaction extraction failed — ${detail}`);
  }

  const body = await response.json();
  if (!body || !Array.isArray(body.reactions)) {
    throw new Error(
      "Reaction extraction failed — unexpected response format.",
    );
  }
  return body as ReactionExtractionResponse;
}

/**
 * GET /api/extractions/{extractionId}/reactions — load cached reactions
 * for a prior extraction (Plan 10 D-23 history hydration).
 *
 * Returns a ReactionExtractionResponse mirroring the POST shape — reactions
 * are read from the DB rather than freshly extracted. When reaction_count
 * is 0, the server returns `reactions: []` with a 200 (not 404).
 * 404 is reserved for "extraction_id does not exist".
 *
 * Callers check `reaction_count > 0` on the HistoryListItem before firing
 * this request so they don't waste round-trips for never-reacted extractions.
 */
export async function getExtractionReactions(
  extractionId: number,
  signal?: AbortSignal,
): Promise<ReactionExtractionResponse> {
  let response: Response;
  try {
    response = await fetch(`/api/extractions/${extractionId}/reactions`, {
      method: "GET",
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new Error(
      "Could not reach the reaction server — check your connection.",
    );
  }

  if (!response.ok) {
    let detail = "please try again";
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // JSON parse failed — use default detail
    }
    throw new Error(`Loading cached reactions failed — ${detail}`);
  }

  const body = await response.json();
  if (!body || !Array.isArray(body.reactions)) {
    throw new Error(
      "Loading cached reactions failed — unexpected response format.",
    );
  }
  return body as ReactionExtractionResponse;
}
