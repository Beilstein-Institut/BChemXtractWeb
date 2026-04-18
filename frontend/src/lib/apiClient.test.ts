/**
 * Tests for postExtract + postReactions + getExtractionReactions API client functions.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * These tests stub globalThis.fetch to verify HTTP behavior
 * without mocking the module itself.
 */
import { vi, beforeEach } from "vitest";
import {
  postExtract,
  postReactions,
  getExtractionReactions,
} from "./apiClient";
import type {
  ExtractionResponse,
  ReactionExtractionResponse,
} from "../types/chemistry";

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

/** Helper: build a valid ReactionExtractionResponse body (Plan 10 D-04 shape). */
const makeReactionsResponse = (
  overrides: Partial<ReactionExtractionResponse> = {},
): ReactionExtractionResponse => ({
  reactions: [],
  format: "cdx",
  filename: "test.cdx",
  file_size: 100,
  reaction_count: 0,
  extraction_time_ms: 12.5,
  warnings: [],
  ...overrides,
});

describe("postReactions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs multipart/form-data to "/api/reactions" with a "file" field', async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeReactionsResponse()),
    } as Response);

    const file = new File(["data"], "test.cdx", { type: "chemical/x-cdx" });
    await postReactions(file);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/reactions");
    expect((options as RequestInit).method).toBe("POST");
    const body = (options as RequestInit).body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("file")).toBe(file);
  });

  it("returns parsed ReactionExtractionResponse on HTTP 200", async () => {
    const mockResponse = makeReactionsResponse({ reaction_count: 2 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await postReactions(
      new File(["data"], "test.cdx", { type: "chemical/x-cdx" }),
    );

    expect(result.reaction_count).toBe(2);
    expect(result.format).toBe("cdx");
  });

  it("throws 'Reaction extraction failed — <detail>' on HTTP 4xx with ErrorResponse.detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 415,
      json: () => Promise.resolve({ detail: "Unsupported format", code: "UNSUPPORTED_FORMAT" }),
    } as Response);

    await expect(
      postReactions(new File(["data"], "test.txt", { type: "text/plain" })),
    ).rejects.toThrow(/Reaction extraction failed — Unsupported format/);
  });

  it("throws connection error on fetch network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Network fail"));

    await expect(
      postReactions(new File(["data"], "test.cdx", { type: "chemical/x-cdx" })),
    ).rejects.toThrow(/Could not reach the reaction server/);
  });

  it("throws unexpected-format error when 200 body has no reactions array", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ oops: true }),
    } as Response);

    await expect(
      postReactions(new File(["data"], "test.cdx", { type: "chemical/x-cdx" })),
    ).rejects.toThrow(/unexpected response format/);
  });

  it("propagates AbortError from the provided signal without wrapping", async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new DOMException("aborted", "AbortError");
    });

    const promise = postReactions(
      new File(["data"], "test.cdx", { type: "chemical/x-cdx" }),
      controller.signal,
    );

    await expect(promise).rejects.toThrow(DOMException);
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("passes the AbortSignal through to fetch() init", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeReactionsResponse()),
    } as Response);

    const controller = new AbortController();
    await postReactions(
      new File(["data"], "test.cdx", { type: "chemical/x-cdx" }),
      controller.signal,
    );

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });
});

describe("getExtractionReactions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GETs "/api/extractions/{id}/reactions" and returns parsed ReactionExtractionResponse', async () => {
    const mockResponse = makeReactionsResponse({ reaction_count: 3 });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await getExtractionReactions(42);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/extractions/42/reactions");
    expect((options as RequestInit).method).toBe("GET");
    expect(result.reaction_count).toBe(3);
  });

  it("throws 'Loading cached reactions failed — <detail>' on HTTP 404 for unknown extraction", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ detail: "Extraction not found" }),
    } as Response);

    await expect(getExtractionReactions(999)).rejects.toThrow(
      /Loading cached reactions failed — Extraction not found/,
    );
  });

  it("propagates AbortError without wrapping", async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new DOMException("aborted", "AbortError");
    });

    const promise = getExtractionReactions(7, controller.signal);

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("passes the AbortSignal through to fetch() init", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeReactionsResponse()),
    } as Response);

    const controller = new AbortController();
    await getExtractionReactions(7, controller.signal);

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });
});
