import type { ExtractionResponse, PagedSubstancesResponse } from "@/types/chemistry";
import type { HistoryListResponse, StatsResponse } from "@/types/history";

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
    throw new Error(
      "Could not reach the extraction server — check your connection."
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
export async function getHistory(
  limit: number | "all" = 10
): Promise<HistoryListResponse> {
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
  sort: "extraction_order" | "formula"
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
