/**
 * Unit tests for apiClient batch functions.
 * Verifies FormData field name, URL shape, and HTTP method contracts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { postBatchStart, getBatchSSEUrl, cancelBatch } from "./apiClient";

describe("postBatchStart", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("appends each file with field name 'files' to FormData", async () => {
    const appendSpy = vi.spyOn(FormData.prototype, "append");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ batch_id: "abc", task_ids: ["t1"], file_count: 1 }),
      })
    );

    const files = [new File(["content"], "test.cdx")];
    await postBatchStart(files);

    expect(appendSpy).toHaveBeenCalledWith("files", files[0]);
  });

  it("POSTs to /api/batch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ batch_id: "abc", task_ids: [], file_count: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await postBatchStart([new File([""], "a.cdx")]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/batch",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ detail: "Batch exceeds 20-file limit" }),
      })
    );

    await expect(postBatchStart([new File([""], "a.cdx")])).rejects.toThrow(
      "Batch exceeds 20-file limit"
    );
  });
});

describe("getBatchSSEUrl", () => {
  it("returns the expected URL shape for a given batchId", () => {
    expect(getBatchSSEUrl("test-batch-123")).toBe(
      "/api/batch/test-batch-123/progress"
    );
  });

  it("URL-encodes the batchId", () => {
    expect(getBatchSSEUrl("id with spaces")).toBe(
      "/api/batch/id%20with%20spaces/progress"
    );
  });
});

describe("cancelBatch", () => {
  it("issues a DELETE request to /api/batch/{batchId}", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    await cancelBatch("my-batch-id");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/batch/my-batch-id",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("resolves without error on 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 204 }));
    await expect(cancelBatch("bid")).resolves.toBeUndefined();
  });
});
