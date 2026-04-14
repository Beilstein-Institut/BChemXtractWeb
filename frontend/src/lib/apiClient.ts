import type { ExtractionResponse } from "@/types/chemistry";

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
