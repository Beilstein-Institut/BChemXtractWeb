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
 * Wrapper around ``fetch`` that centralises the patterns every endpoint
 * in this module needs:
 *
 *  - A `TypeError` / network failure becomes a user-facing connection
 *    error. `AbortError` is re-thrown unwrapped so callers can tell
 *    "user cancelled" apart from "backend down".
 *  - A non-2xx response is inspected for the unified ``ErrorResponse``
 *    shape (``{ detail, code }``) and translated into a typed Error.
 *    Backends that return non-JSON on error fall back to a supplied
 *    default detail.
 *
 * Keeping one implementation means the JSON-envelope contract and
 * rate-limit / API-key behaviour only live in one place. Per-endpoint
 * helpers below only deal in URL, body, and response-shape validation.
 */
interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: BodyInit | null;
  /** Human-readable connection error (TypeError path). */
  connectionError?: string;
  /** Prefix for non-2xx errors, e.g. "Extraction failed". */
  errorPrefix: string;
}

const DEFAULT_CONNECTION_ERROR =
  "Could not reach the server — check your connection.";

function isAbortError(err: unknown): err is DOMException {
  return err instanceof DOMException && err.name === "AbortError";
}

async function extractErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // Fall through — response wasn't JSON.
  }
  return "please try again";
}

async function apiFetch(
  url: string,
  { connectionError, errorPrefix, ...init }: ApiFetchOptions,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new Error(connectionError ?? DEFAULT_CONNECTION_ERROR);
  }
  if (!response.ok) {
    const detail = await extractErrorDetail(response);
    throw new Error(`${errorPrefix} — ${detail}`);
  }
  return response;
}

/**
 * Parses a JSON response and validates the envelope shape. The
 * ``validate`` callback must return ``true`` for an acceptable body
 * (e.g. ``"substances" in b``); anything else becomes an
 * ``unexpected response format`` error.
 */
async function parseJsonEnvelope<T>(
  response: Response,
  errorPrefix: string,
  validate: (body: unknown) => boolean,
): Promise<T> {
  const body = await response.json();
  if (!body || !validate(body)) {
    throw new Error(`${errorPrefix} — unexpected response format from server.`);
  }
  return body as T;
}

/** Trigger a browser download for a binary blob via a hidden anchor. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Extract a filename from a ``Content-Disposition`` header per RFC 6266.
 *
 * The backend emits both ``filename="<ascii>"`` and
 * ``filename*=UTF-8''<percent-encoded>`` — the starred form is the
 * authoritative UTF-8 name. This parser prefers the starred form and
 * falls back to the ASCII form when the percent-encoding is malformed
 * or the charset is not UTF-8. Returns ``null`` when no filename can be
 * recovered so callers can fall back to their own suggestion.
 */
export function parseContentDispositionFilename(
  header: string | null,
): string | null {
  if (!header) return null;

  // filename*=charset'lang'percent-encoded (RFC 5987).
  const extMatch = /filename\*\s*=\s*([^']*)'([^']*)'([^;]+)/i.exec(header);
  if (extMatch) {
    const charset = extMatch[1].trim().toLowerCase();
    const encoded = extMatch[3].trim();
    if (charset === "utf-8" || charset === "") {
      try {
        const decoded = decodeURIComponent(encoded);
        if (decoded) return decoded;
      } catch {
        // Malformed percent-encoding — fall through to the ASCII form.
      }
    }
  }

  // filename="ascii" or filename=ascii (no quotes, no semicolons).
  const asciiMatch = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header);
  if (asciiMatch) {
    const value = (asciiMatch[1] ?? asciiMatch[2] ?? "").trim();
    if (value) return value;
  }

  return null;
}

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

  const response = await apiFetch("/api/extract", {
    method: "POST",
    body: formData,
    connectionError:
      "Could not reach the extraction server — check your connection.",
    errorPrefix: "Extraction failed",
  });
  return parseJsonEnvelope<ExtractionResponse>(
    response,
    "Extraction failed",
    (b) => Array.isArray((b as { substances?: unknown }).substances),
  );
}

/**
 * Fetch extraction history list.
 * @param limit - Number of entries to fetch. Use "all" for no limit.
 */
export async function getHistory(
  limit: number | "all" = 10,
): Promise<HistoryListResponse> {
  const response = await apiFetch(`/api/history?limit=${limit}`, {
    errorPrefix: "Failed to load history",
  });
  return response.json() as Promise<HistoryListResponse>;
}

/**
 * Fetch the full extraction result for one history entry (HIST-02).
 * Returns the same ExtractionResponse shape as POST /api/extract.
 */
export async function getHistoryDetail(id: number): Promise<ExtractionResponse> {
  const response = await apiFetch(`/api/history/${id}`, {
    errorPrefix: "Failed to load extraction",
  });
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
    throw new Error(DEFAULT_CONNECTION_ERROR);
  }
  if (!response.ok && response.status !== 204) {
    throw new Error("Could not delete extraction. Try again.");
  }
}

/**
 * Fetch aggregate statistics (HIST-04, D-08).
 */
export async function getStats(): Promise<StatsResponse> {
  const response = await apiFetch("/api/stats", {
    errorPrefix: "Failed to load statistics",
  });
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
  const response = await apiFetch(url, {
    errorPrefix: "Failed to load structures",
  });
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
  const response = await apiFetch("/api/batch", {
    method: "POST",
    body: formData,
    errorPrefix: "Batch start failed",
  });
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
  await apiFetch(`/api/batch/${encodeURIComponent(batchId)}`, {
    method: "DELETE",
    errorPrefix: "Could not cancel batch",
  });
}

/**
 * GET /api/batch/{batchId}/zip — trigger ZIP download.
 * Creates a temporary anchor element to trigger browser download.
 * Throws if the fetch fails or returns non-ok.
 */
export async function downloadBatchZip(batchId: string): Promise<void> {
  const response = await apiFetch(`/api/batch/${encodeURIComponent(batchId)}/zip`, {
    errorPrefix: "ZIP download failed",
  });
  triggerDownload(await response.blob(), `batch_${batchId.slice(0, 8)}.zip`);
}

/**
 * POST /api/export — trigger chemical format export and download.
 *
 * POSTs JSON payload, receives a file blob (SDF, ZIP, JSON, CSV, etc.),
 * and triggers a browser download via temporary anchor element.
 *
 * The server is the single source of truth for the download filename:
 * the ``Content-Disposition`` header it emits already carries the
 * correct extension (``.svg`` vs ``.zip``, ``.png`` vs ``.zip``, etc.)
 * based on whether the response is a single file or a multi-entry ZIP.
 * We honor that header; ``suggestedFilename`` is kept only as a fallback
 * for the edge case where the header is missing or unparseable.
 *
 * @param payload - ExportRequest with format and substance_ids or extraction_id
 * @param suggestedFilename - Fallback filename when Content-Disposition is absent
 */
export async function postExport(
  payload: ExportRequest,
  suggestedFilename: string,
): Promise<void> {
  const response = await apiFetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    errorPrefix: "Export failed",
  });
  const headerFilename = parseContentDispositionFilename(
    response.headers.get("Content-Disposition"),
  );
  triggerDownload(await response.blob(), headerFilename ?? suggestedFilename);
}

/**
 * POST /api/search — execute a structure search.
 *
 * Returns the parsed JSON response. Throws an Error on HTTP errors or
 * network failure. Error message pulls `body.detail` from the unified
 * ErrorResponse shape (Plan 05, D-17).
 */
export async function postSearch(payload: SearchRequest): Promise<SearchResponse> {
  const response = await apiFetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    errorPrefix: "Search failed",
  });
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

  const response = await apiFetch("/api/reactions", {
    method: "POST",
    body: formData,
    signal,
    connectionError:
      "Could not reach the reaction server — check your connection.",
    errorPrefix: "Reaction extraction failed",
  });
  return parseJsonEnvelope<ReactionExtractionResponse>(
    response,
    "Reaction extraction failed",
    (b) => Array.isArray((b as { reactions?: unknown }).reactions),
  );
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
  const response = await apiFetch(`/api/extractions/${extractionId}/reactions`, {
    method: "GET",
    signal,
    connectionError:
      "Could not reach the reaction server — check your connection.",
    errorPrefix: "Loading cached reactions failed",
  });
  return parseJsonEnvelope<ReactionExtractionResponse>(
    response,
    "Loading cached reactions failed",
    (b) => Array.isArray((b as { reactions?: unknown }).reactions),
  );
}
