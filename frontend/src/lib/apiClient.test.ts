/**
 * Tests for postExtract API client function.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * These tests stub globalThis.fetch to verify postExtract's HTTP behavior
 * without mocking the module itself.
 */
import { vi, beforeEach } from "vitest";
import { postExtract } from "./apiClient";
import type { ExtractionResponse } from "../types/chemistry";

const makeMockResponse = (): ExtractionResponse => ({
  substances: [],
  info: { no_fragments: 0, no_inchis: 0, no_substances: 0 },
  format: "cdx",
  filename: "test.cdx",
  file_size: 1024,
  structure_count: 0,
  extraction_time_ms: 42.0,
  warnings: [],
});

describe("postExtract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds FormData with a "file" field and POSTs to "/api/extract"', async () => {
    const mockResponse = makeMockResponse();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const file = new File(["data"], "test.cdx");
    await postExtract(file);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/extract");
    expect((options as RequestInit).method).toBe("POST");
    const body = (options as RequestInit).body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("file")).toBe(file);
  });

  it("returns typed ExtractionResponse on HTTP 200", async () => {
    const mockResponse = makeMockResponse();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const file = new File(["data"], "test.cdx");
    const result = await postExtract(file);

    expect(result).toEqual(mockResponse);
  });

  it("throws an Error containing the API detail string on HTTP 4xx/5xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ detail: "Unsupported file format" }),
    } as Response);

    const file = new File(["data"], "test.cdx");

    await expect(postExtract(file)).rejects.toThrow("Unsupported file format");
  });

  it("throws network failure error when fetch throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    const file = new File(["data"], "test.cdx");

    await expect(postExtract(file)).rejects.toThrow(
      "Could not reach the extraction server — check your connection."
    );
  });
});
