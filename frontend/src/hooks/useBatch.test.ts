import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useBatch } from "./useBatch";

// Mock apiClient
vi.mock("@/lib/apiClient", () => ({
  postBatchStart: vi.fn(),
  getBatchSSEUrl: vi.fn((id: string) => `/api/batch/${id}/progress`),
  cancelBatch: vi.fn(),
  downloadBatchZip: vi.fn(),
}));

// Mock EventSource — must be a class so `new EventSource(...)` works
const mockEventSource = {
  addEventListener: vi.fn(),
  close: vi.fn(),
};
class MockEventSource {
  addEventListener = mockEventSource.addEventListener;
  close = mockEventSource.close;
}
vi.stubGlobal("EventSource", MockEventSource);

// Mock sonner
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { postBatchStart, cancelBatch as apiCancelBatch } from "@/lib/apiClient";

describe("useBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts in idle state", () => {
    const { result } = renderHook(() => useBatch());
    expect(result.current.state).toBe("idle");
    expect(result.current.files).toHaveLength(0);
    expect(result.current.batchId).toBeNull();
  });

  it("transitions to processing when startBatch is called", async () => {
    vi.mocked(postBatchStart).mockResolvedValue({
      batch_id: "test-batch-id",
      group_id: "test-group-id",
      task_ids: ["t1"],
      file_count: 1,
    });

    const { result } = renderHook(() => useBatch());
    const files = [new File(["content"], "test.cdx")];

    await act(async () => {
      await result.current.startBatch(files);
    });

    expect(result.current.state).toBe("processing");
    expect(result.current.batchId).toBe("test-batch-id");
    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].state).toBe("queued");
  });

  it("transitions to error state when postBatchStart fails", async () => {
    vi.mocked(postBatchStart).mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useBatch());

    await act(async () => {
      await result.current.startBatch([new File([""], "test.cdx")]);
    });

    expect(result.current.state).toBe("error");
    expect(result.current.errorMessage).toContain("Network error");
  });

  it("reset returns to idle state", async () => {
    vi.mocked(postBatchStart).mockResolvedValue({
      batch_id: "bid",
      group_id: "gid",
      task_ids: [],
      file_count: 0,
    });

    const { result } = renderHook(() => useBatch());

    await act(async () => {
      await result.current.startBatch([new File([""], "f.cdx")]);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toBe("idle");
    expect(result.current.batchId).toBeNull();
    expect(result.current.files).toHaveLength(0);
  });

  it("cancelBatch calls apiCancelBatch and transitions to cancelled", async () => {
    vi.mocked(postBatchStart).mockResolvedValue({
      batch_id: "bid",
      group_id: "gid",
      task_ids: [],
      file_count: 0,
    });
    vi.mocked(apiCancelBatch).mockResolvedValue(undefined);

    const { result } = renderHook(() => useBatch());

    await act(async () => {
      await result.current.startBatch([new File([""], "f.cdx")]);
    });

    await act(async () => {
      await result.current.cancelBatch();
    });

    expect(result.current.state).toBe("cancelled");
    expect(apiCancelBatch).toHaveBeenCalledWith("gid");
    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it("cancelBatch stays in processing (does NOT claim cancelled) when the stop request fails", async () => {
    vi.mocked(postBatchStart).mockResolvedValue({
      batch_id: "bid",
      group_id: "gid",
      task_ids: [],
      file_count: 0,
    });
    vi.mocked(apiCancelBatch).mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useBatch());
    await act(async () => {
      await result.current.startBatch([new File([""], "f.cdx")]);
    });
    await act(async () => {
      await result.current.cancelBatch();
    });

    // The stop didn't reach the server — must not falsely report "cancelled".
    expect(result.current.state).toBe("processing");
  });

  it("completedCount and failedCount computed correctly", () => {
    // This tests the computed values directly from files state
    const { result } = renderHook(() => useBatch());
    expect(result.current.completedCount).toBe(0);
    expect(result.current.failedCount).toBe(0);
    expect(result.current.totalStructures).toBe(0);
  });

  it("retains uploaded files so getUploadedFile resolves the File by extraction id", async () => {
    vi.mocked(postBatchStart).mockResolvedValue({
      batch_id: "bid",
      group_id: "gid",
      task_ids: ["t1"],
      file_count: 1,
    });

    const { result } = renderHook(() => useBatch());
    const fileA = new File(["content"], "a.cdx");

    await act(async () => {
      await result.current.startBatch([fileA]);
    });

    // Grab the file_complete handler the hook registered on the EventSource and
    // drive it as the server would once a.cdx finishes extracting.
    const handler = mockEventSource.addEventListener.mock.calls.find(
      ([evt]) => evt === "file_complete",
    )?.[1] as (e: MessageEvent) => void;
    expect(handler).toBeTypeOf("function");

    act(() => {
      handler({
        data: JSON.stringify({
          task_id: "t1",
          state: "SUCCESS",
          result: { filename: "a.cdx", structure_count: 3, extraction_id: 42, error: null },
        }),
      } as MessageEvent);
    });

    // The just-uploaded bytes are still in memory — no re-upload needed to
    // extract reactions for this batch file.
    expect(result.current.getUploadedFile(42)).toBe(fileA);
    // Unknown extraction id → null (e.g. a history entry from another session).
    expect(result.current.getUploadedFile(999)).toBeNull();

    act(() => {
      result.current.reset();
    });
    expect(result.current.getUploadedFile(42)).toBeNull();
  });
});
