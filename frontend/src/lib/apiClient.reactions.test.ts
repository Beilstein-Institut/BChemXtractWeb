import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { postExtractReactionsFromStored, ApiError } from "@/lib/apiClient";
import { csrfTokenCache } from "@/lib/csrfTokenCache";

// Prime the CSRF cache so apiFetch skips its cold-start pre-fetch (which
// would otherwise consume the shared stubbed-fetch Response body before the
// real request reads it — see apiClient.test.ts for the same pattern).
beforeEach(() => {
  csrfTokenCache.value = "test-token.0000.signature";
});

afterEach(() => {
  vi.restoreAllMocks();
  csrfTokenCache.value = null;
});

describe("postExtractReactionsFromStored", () => {
  it("throws ApiError with code FILE_NOT_STORED on 409", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "no file", code: "FILE_NOT_STORED" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(postExtractReactionsFromStored(42)).rejects.toMatchObject({
      code: "FILE_NOT_STORED",
    });
    await expect(postExtractReactionsFromStored(42)).rejects.toBeInstanceOf(ApiError);
  });

  it("returns the reaction envelope on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            reactions: [],
            warnings: [],
            format: "cdx",
            filename: "x",
            file_size: 1,
            reaction_count: 0,
            extraction_time_ms: 0,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
    const res = await postExtractReactionsFromStored(42);
    expect(res.reactions).toEqual([]);
  });
});
