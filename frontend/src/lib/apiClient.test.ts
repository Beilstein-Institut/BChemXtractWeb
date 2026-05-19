/**
 * Tests for postExtract + postReactions + getExtractionReactions API client functions.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * These tests stub globalThis.fetch to verify HTTP behavior
 * without mocking the module itself.
 */
import { afterEach, vi, beforeEach } from "vitest";
import {
  postExtract,
  postReactions,
  getExtractionReactions,
  postExport,
  postSearchValidate,
  parseContentDispositionFilename,
  getHistory,
  putAuthMe,
} from "./apiClient";
import { csrfTokenCache } from "./csrfTokenCache";
import type { ExtractionResponse, ReactionExtractionResponse } from "../types/chemistry";

// Phase 11: apiFetch pre-fetches the CSRF token when the module cache is
// empty AND the method is state-changing, to avoid the cold-start 403→retry
// pair on a returning visitor (Plan 11-06). The general-purpose tests below
// stub `globalThis.fetch` and assert `toHaveBeenCalledOnce`, so we prime the
// cache here to skip the prefetch path and exercise only the request the
// test cares about. Tests that explicitly want the cold-cache flow (the
// "Phase 11: cookie + CSRF wiring (PRIV-11)" suite below) reset it to null
// in their own beforeEach.
beforeEach(() => {
  csrfTokenCache.value = "test-token.0000.signature";
});

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
      "Extraction server unreachable. Check your network and retry.",
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

    const result = await postReactions(new File(["data"], "test.cdx", { type: "chemical/x-cdx" }));

    expect(result.reaction_count).toBe(2);
    expect(result.format).toBe("cdx");
  });

  it("throws 'Reaction extraction failed: <detail>' on HTTP 4xx with ErrorResponse.detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 415,
      json: () => Promise.resolve({ detail: "Unsupported format", code: "UNSUPPORTED_FORMAT" }),
    } as Response);

    await expect(
      postReactions(new File(["data"], "test.txt", { type: "text/plain" })),
    ).rejects.toThrow(/Reaction extraction failed: Unsupported format/);
  });

  it("throws connection error on fetch network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Network fail"));

    await expect(
      postReactions(new File(["data"], "test.cdx", { type: "chemical/x-cdx" })),
    ).rejects.toThrow(/Reaction server unreachable/);
  });

  it("throws unexpected-format error when 200 body has no reactions array", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ oops: true }),
    } as Response);

    await expect(
      postReactions(new File(["data"], "test.cdx", { type: "chemical/x-cdx" })),
    ).rejects.toThrow(/server returned an unexpected response/);
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

  it("throws 'Loading cached reactions failed: <detail>' on HTTP 404 for unknown extraction", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ detail: "Extraction not found" }),
    } as Response);

    await expect(getExtractionReactions(999)).rejects.toThrow(
      /Loading cached reactions failed: Extraction not found/,
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

describe("parseContentDispositionFilename", () => {
  it("returns null for null / empty header", () => {
    expect(parseContentDispositionFilename(null)).toBeNull();
    expect(parseContentDispositionFilename("")).toBeNull();
  });

  it('parses plain ASCII filename="..."', () => {
    expect(parseContentDispositionFilename('attachment; filename="export.svg"')).toBe("export.svg");
  });

  it("parses unquoted filename=value", () => {
    expect(parseContentDispositionFilename("attachment; filename=export.zip")).toBe("export.zip");
  });

  it("prefers filename* over filename when both are present (RFC 6266)", () => {
    const header = "attachment; filename=\"fallback.svg\"; filename*=UTF-8''preferred.svg";
    expect(parseContentDispositionFilename(header)).toBe("preferred.svg");
  });

  it("percent-decodes filename* values", () => {
    const header = "attachment; filename*=UTF-8''bchemxtract_export_svg_20260421.zip";
    expect(parseContentDispositionFilename(header)).toBe("bchemxtract_export_svg_20260421.zip");
  });

  it("decodes unicode code points in filename*", () => {
    const header = "attachment; filename*=UTF-8''%E6%97%A5%E6%9C%AC.svg";
    expect(parseContentDispositionFilename(header)).toBe("日本.svg");
  });

  it("falls back to ASCII filename when filename* percent-encoding is malformed", () => {
    const header = "attachment; filename=\"safe.svg\"; filename*=UTF-8''%E6%97%";
    expect(parseContentDispositionFilename(header)).toBe("safe.svg");
  });

  it("returns null when no filename parameter is present", () => {
    expect(parseContentDispositionFilename("attachment")).toBeNull();
    expect(parseContentDispositionFilename("inline; foo=bar")).toBeNull();
  });
});

describe("postExport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Stub DOM sinks so triggerDownload can run in jsdom. Captures the anchor
   * element `postExport` creates so tests can assert on `anchor.download`
   * without sifting through createElement spy results.
   */
  function stubDomDownload(): {
    clickSpy: ReturnType<typeof vi.fn>;
    getAnchor: () => HTMLAnchorElement;
  } {
    const clickSpy = vi.fn();
    let anchor: HTMLAnchorElement | null = null;
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clickSpy);
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag) as HTMLElement;
      if (tag === "a") anchor = el as HTMLAnchorElement;
      return el;
    });
    return {
      clickSpy,
      getAnchor: () => {
        if (!anchor) throw new Error("No <a> element was created");
        return anchor;
      },
    };
  }

  it("uses filename from Content-Disposition (filename*=UTF-8) over suggestedFilename", async () => {
    const { clickSpy, getAnchor } = stubDomDownload();
    const headers = new Headers({
      "Content-Disposition":
        "attachment; filename=\"bchemxtract_export_svg_20260421.zip\"; filename*=UTF-8''bchemxtract_export_svg_20260421.zip",
      "Content-Type": "application/zip",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers,
      blob: () => Promise.resolve(new Blob(["zip-bytes"])),
    } as unknown as Response);

    await postExport({ format: "svg", substance_ids: [1, 2] }, "wrong-suggestion.svg");

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(getAnchor().download).toBe("bchemxtract_export_svg_20260421.zip");
  });

  it("falls back to suggestedFilename when Content-Disposition header is missing", async () => {
    const { clickSpy, getAnchor } = stubDomDownload();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers({ "Content-Type": "image/svg+xml" }),
      blob: () => Promise.resolve(new Blob(["<svg/>"])),
    } as unknown as Response);

    await postExport({ format: "svg", substance_ids: [1] }, "fallback.svg");

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(getAnchor().download).toBe("fallback.svg");
  });
});

describe("postSearchValidate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs to /api/search/validate with query and stereo", async () => {
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          valid: true,
          language: "smiles",
          atom_count: 6,
          error: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await postSearchValidate({ query: "c1ccccc1", stereo: false });

    expect(result.valid).toBe(true);
    expect(result.language).toBe("smiles");
    expect(result.atom_count).toBe(6);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/search/validate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
    const body = (fetchSpy.mock.calls[0][1] as RequestInit).body as string;
    expect(JSON.parse(body)).toEqual({ query: "c1ccccc1", stereo: false });
  });

  it("throws on non-2xx response", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "validation error", code: "VALIDATION_ERROR" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(postSearchValidate({ query: "" })).rejects.toThrow();
  });
});

describe("Phase 11: cookie + CSRF wiring (PRIV-11)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    csrfTokenCache.value = null;
  });

  afterEach(() => {
    csrfTokenCache.value = null;
  });

  it("sends credentials: 'include' on every request via apiFetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], total: 0 }),
    } as Response);

    await getHistory();

    expect(fetchSpy).toHaveBeenCalled();
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe("include");
  });

  it("injects X-CSRF-Token on PUT when token is cached", async () => {
    csrfTokenCache.value = "token-abc.123.signature";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: "x", has_history: false }),
    } as Response);

    await putAuthMe();

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBe("token-abc.123.signature");
  });

  it("does NOT inject X-CSRF-Token on GET", async () => {
    csrfTokenCache.value = "token-abc.123.signature";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], total: 0 }),
    } as Response);

    await getHistory();

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBeUndefined();
  });

  it("retries PUT once with refreshed token on 403/CSRF_INVALID", async () => {
    csrfTokenCache.value = "stale-token";
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        // First call (state-changing PUT) — 403 + CSRF_INVALID sentinel.
        // `clone()` must return a thenable Response-like with `json()`
        // because apiFetch reads the body off the clone.
        const body = { detail: "CSRF token invalid", code: "CSRF_INVALID" };
        const mock: Partial<Response> = {
          ok: false,
          status: 403,
          json: () => Promise.resolve(body),
          clone() {
            return {
              ok: false,
              status: 403,
              json: () => Promise.resolve(body),
            } as Response;
          },
        };
        return Promise.resolve(mock as Response);
      }
      if (callCount === 2) {
        // Token refresh GET → returns fresh token.
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ csrf_token: "fresh-token" }),
        } as Response);
      }
      // Retried PUT → 200.
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session_id: "x", has_history: false }),
      } as Response);
    });

    await putAuthMe();

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(callCount).toBe(3);
    expect(csrfTokenCache.value).toBe("fresh-token");
    // The retried PUT carries the fresh token.
    const retryInit = fetchSpy.mock.calls[2][1] as RequestInit;
    const retryHeaders = retryInit.headers as Record<string, string>;
    expect(retryHeaders["X-CSRF-Token"]).toBe("fresh-token");
  });
});
