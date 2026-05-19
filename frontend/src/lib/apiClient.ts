import { csrfTokenCache, needsCsrf } from "@/lib/csrfTokenCache";
import type {
  ExtractionResponse,
  PagedSubstancesResponse,
  ReactionExtractionResponse,
} from "@/types/chemistry";
import type { HistoryListResponse, StatsResponse } from "@/types/history";
import type { BatchStartResponse } from "@/types/batch";
import type { ExportRequest } from "@/types/export";
import type {
  SearchRequest,
  SearchResponse,
  SearchValidateRequest,
  SearchValidateResponse,
} from "@/types/search";
import type { CsrfTokenResponse, RestoreRequest, SessionInfoResponse } from "@/types/auth";

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

const DEFAULT_CONNECTION_ERROR = "Server unreachable. Check your network and retry.";

function isAbortError(err: unknown): err is DOMException {
  return err instanceof DOMException && err.name === "AbortError";
}

async function extractErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // Response wasn't JSON.
  }
  return "no detail returned";
}

/**
 * Detects the Phase 11 CSRF middleware's 403 + `{code: "CSRF_INVALID"}`
 * sentinel without consuming the original response body. The body is
 * read from a clone so the outer error handler can still surface the
 * detail string if the retry also fails.
 *
 * Returns false fast when the status is not 403 — avoids cloning on
 * the happy path (which also keeps test doubles that omit `clone()`
 * from blowing up the wrapper).
 */
async function isCsrfError(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  // jsdom + the project's test doubles may stub the Response without a
  // `clone()` method. Fall back to reading the original body in that case
  // — the only callers downstream are the retry path (cares about status
  // only) and `extractErrorDetail` (consumes its own body, swallows
  // already-consumed errors).
  const probe = typeof response.clone === "function" ? response.clone() : response;
  try {
    const body = await probe.json();
    return body?.code === "CSRF_INVALID";
  } catch {
    return false;
  }
}

/**
 * Refreshes the module-level CSRF token via the public token endpoint.
 *
 * Deliberately uses raw `fetch` (NOT `apiFetch`) — going through apiFetch
 * would inject `X-CSRF-Token` on the very call that fetches the token, and
 * a 403/CSRF_INVALID response would recursively invoke this function.
 */
async function refreshCsrfToken(): Promise<void> {
  try {
    const r = await fetch("/api/csrf-token", { credentials: "include" });
    if (!r.ok) return;
    const body = await r.json();
    if (typeof body?.csrf_token === "string") {
      csrfTokenCache.value = body.csrf_token;
    }
  } catch {
    /* ignore — caller will surface the original 403 if retry fails */
  }
}

async function apiFetch(
  url: string,
  { connectionError, errorPrefix, ...init }: ApiFetchOptions,
): Promise<Response> {
  let response: Response;

  // Phase 11 D-19: state-changing requests carry the CSRF token from the
  // module-level cache (populated by useCsrfToken on mount + on retry below).
  // Cold-start path (returning visitor: cookie present, cache empty because
  // useCsrfToken hasn't completed its bootstrap yet): pre-fetch the token
  // so the very first state-changing call doesn't 403 → retry. The retry
  // path below stays as a fallback for stale tokens mid-session.
  if (needsCsrf(init.method) && !csrfTokenCache.value) {
    await refreshCsrfToken();
  }
  const csrfHeaders: Record<string, string> = {};
  if (needsCsrf(init.method) && csrfTokenCache.value) {
    csrfHeaders["X-CSRF-Token"] = csrfTokenCache.value;
  }

  // Phase 11 D-20: `credentials: "include"` on EVERY request so the
  // `bcx_sid` cookie travels with both GET (RLS read scope) and
  // state-changing calls (RLS write scope).
  const enhancedInit: RequestInit = {
    ...init,
    credentials: "include",
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...csrfHeaders,
    },
  };

  try {
    response = await fetch(url, enhancedInit);
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new Error(connectionError ?? DEFAULT_CONNECTION_ERROR);
  }

  // PRIV-11 retry path: a stale CSRF token (Phase 11-04 middleware returns
  // 403 + {code:"CSRF_INVALID"}) triggers a single token refresh + retry.
  // `isCsrfError` clones the response internally so the outer error path
  // can still consume the body if the retry attempt also fails.
  if (await isCsrfError(response)) {
    await refreshCsrfToken();
    const retryHeaders = { ...(enhancedInit.headers as Record<string, string>) };
    if (csrfTokenCache.value) retryHeaders["X-CSRF-Token"] = csrfTokenCache.value;
    const retryInit: RequestInit = { ...enhancedInit, headers: retryHeaders };
    try {
      response = await fetch(url, retryInit);
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw new Error(connectionError ?? DEFAULT_CONNECTION_ERROR);
    }
  }

  if (!response.ok) {
    const detail = await extractErrorDetail(response);
    throw new Error(`${errorPrefix}: ${detail}`);
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
    throw new Error(`${errorPrefix}: server returned an unexpected response.`);
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
export function parseContentDispositionFilename(header: string | null): string | null {
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
    connectionError: "Extraction server unreachable. Check your network and retry.",
    errorPrefix: "Extraction failed",
  });
  return parseJsonEnvelope<ExtractionResponse>(response, "Extraction failed", (b) =>
    Array.isArray((b as { substances?: unknown }).substances),
  );
}

/**
 * Fetch extraction history list.
 * @param limit - Number of entries to fetch. Use "all" for no limit.
 */
export async function getHistory(limit: number | "all" = 10): Promise<HistoryListResponse> {
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
 *
 * Routed through `apiFetch` so the request carries `credentials: "include"`
 * and the auto-injected `X-CSRF-Token` header (Phase 11 D-19/D-20).
 */
export async function deleteHistoryEntry(id: number): Promise<void> {
  await apiFetch(`/api/history/${id}`, {
    method: "DELETE",
    errorPrefix: "Could not delete extraction. Try again",
  });
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
export async function postExport(payload: ExportRequest, suggestedFilename: string): Promise<void> {
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
 * POST /api/search/validate — parse-only validation of a substructure
 * query. Returns { valid, language, atom_count, error }. Used by the
 * live-typing flow: while the user types, we hit this cheap endpoint
 * and only fire the main /search once it returns valid=true.
 */
export async function postSearchValidate(
  payload: SearchValidateRequest,
): Promise<SearchValidateResponse> {
  const response = await apiFetch("/api/search/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    errorPrefix: "Query validation failed",
  });
  return response.json() as Promise<SearchValidateResponse>;
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
    connectionError: "Reaction server unreachable. Check your network and retry.",
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
    connectionError: "Reaction server unreachable. Check your network and retry.",
    errorPrefix: "Loading cached reactions failed",
  });
  return parseJsonEnvelope<ReactionExtractionResponse>(
    response,
    "Loading cached reactions failed",
    (b) => Array.isArray((b as { reactions?: unknown }).reactions),
  );
}

/**
 * PUT /api/auth/me — idempotent session bootstrap (Phase 11 D-23).
 *
 * Causes the backend to issue a `bcx_sid` cookie if none is present (or
 * to confirm the existing one). Returns the session_id and `has_history`
 * which drives the Settings page recovery-code display + empty-state UX.
 */
export async function putAuthMe(): Promise<SessionInfoResponse> {
  const response = await apiFetch("/api/auth/me", {
    method: "PUT",
    errorPrefix: "Session bootstrap failed",
  });
  return response.json() as Promise<SessionInfoResponse>;
}

/**
 * POST /api/auth/restore — cookie-swap restore via recovery code (D-09).
 *
 * On success the backend returns 204 with a `Set-Cookie: bcx_sid=<code>`
 * header. No body. Replaces the current session — does NOT merge data.
 */
export async function postAuthRestore(code: string): Promise<void> {
  await apiFetch("/api/auth/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code } satisfies RestoreRequest),
    errorPrefix: "Restore failed",
  });
}

/**
 * GET /api/csrf-token — fetches a session-bound CSRF token (D-19).
 *
 * Deliberately bypasses `apiFetch` because apiFetch would inject the
 * `X-CSRF-Token` header on a request that fetches the token itself — and
 * a 403/CSRF_INVALID on this endpoint would recursively call into the
 * retry path. The cache write happens in `useCsrfToken.refresh()` on the
 * hook side; this helper just returns the wire shape.
 */
export async function getCsrfToken(): Promise<CsrfTokenResponse> {
  const r = await fetch("/api/csrf-token", { credentials: "include" });
  if (!r.ok) throw new Error(`CSRF token fetch failed — HTTP ${r.status}`);
  return r.json() as Promise<CsrfTokenResponse>;
}

/**
 * DELETE /api/me/data — GDPR Article 17 hard-delete (Phase 11 D-14).
 *
 * Removes all extractions / substances / reactions owned by the caller's
 * cookie session, clears the cookie, and writes a `data.deleted` audit
 * row in the same transaction. Returns 204 on success.
 */
export async function deleteMyData(): Promise<void> {
  await apiFetch("/api/me/data", {
    method: "DELETE",
    errorPrefix: "Delete-my-data failed",
  });
}
