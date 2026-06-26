/**
 * Tests for useExtract hook.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * The async extraction API client (submit + poll + history detail) is mocked
 * here so we can test the hook's state machine in isolation.
 */
import { renderHook, act } from "@testing-library/react";
import { vi, beforeEach } from "vitest";
import type { ExtractionResponse } from "../types/chemistry";
import type { ExtractJob, ExtractJobStatus } from "../lib/apiClient";

vi.mock("../lib/apiClient", () => ({
  postExtractJob: vi.fn(),
  getExtractJobStatus: vi.fn(),
  getHistoryDetail: vi.fn(),
}));

import { useExtract } from "./useExtract";
import { getExtractJobStatus, getHistoryDetail, postExtractJob } from "../lib/apiClient";

const mockSubmit = postExtractJob as ReturnType<typeof vi.fn>;
const mockStatus = getExtractJobStatus as ReturnType<typeof vi.fn>;
const mockDetail = getHistoryDetail as ReturnType<typeof vi.fn>;

const makeMockResponse = (): ExtractionResponse => ({
  substances: [],
  info: { no_fragments: 0, no_inchis: 0, no_substances: 0 },
  format: "cdx",
  filename: "test.cdx",
  file_size: 1024,
  structure_count: 0,
  extraction_time_ms: 42.0,
  warnings: [],
  extraction_id: 5,
});

const file = () => new File(["data"], "test.cdx");

describe("useExtract hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initial state is { state: "idle", result: null, errorMessage: null }', () => {
    const { result } = renderHook(() => useExtract());
    expect(result.current.state).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('extract() transitions state to "loading" while the submit is in flight', async () => {
    let resolveSubmit!: (v: ExtractJob) => void;
    mockSubmit.mockReturnValue(
      new Promise<ExtractJob>((r) => {
        resolveSubmit = r;
      }),
    );

    const { result } = renderHook(() => useExtract());
    act(() => void result.current.extract(file()));
    expect(result.current.state).toBe("loading");

    // Resolve so the poll loop finishes cleanly.
    mockStatus.mockResolvedValue({ state: "done", extraction_id: 5 } satisfies ExtractJobStatus);
    mockDetail.mockResolvedValue(makeMockResponse());
    await act(async () => {
      resolveSubmit({ task_id: "t1" });
    });
  });

  it('transitions to "success" with the full result when the job completes', async () => {
    mockSubmit.mockResolvedValue({ task_id: "t1" });
    mockStatus.mockResolvedValue({ state: "done", extraction_id: 5 } satisfies ExtractJobStatus);
    const full = makeMockResponse();
    mockDetail.mockResolvedValue(full);

    const { result } = renderHook(() => useExtract());
    await act(async () => {
      await result.current.extract(file());
    });

    expect(result.current.state).toBe("success");
    expect(result.current.result).toEqual(full);
    expect(mockDetail).toHaveBeenCalledWith(5);
    expect(result.current.errorMessage).toBeNull();
  });

  it('transitions to "error" when the job reports a failure', async () => {
    mockSubmit.mockResolvedValue({ task_id: "t1" });
    mockStatus.mockResolvedValue({
      state: "failed",
      error: "CDK could not parse the file",
    } satisfies ExtractJobStatus);

    const { result } = renderHook(() => useExtract());
    await act(async () => {
      await result.current.extract(file());
    });

    expect(result.current.state).toBe("error");
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBe("CDK could not parse the file");
  });

  it('transitions to "error" when the submit itself rejects (e.g. 415)', async () => {
    mockSubmit.mockRejectedValue(new Error("Extraction failed: unsupported format"));

    const { result } = renderHook(() => useExtract());
    await act(async () => {
      await result.current.extract(file());
    });

    expect(result.current.state).toBe("error");
    expect(result.current.errorMessage).toBe("Extraction failed: unsupported format");
  });

  it('treats a "done" status with no extraction_id as an error', async () => {
    mockSubmit.mockResolvedValue({ task_id: "t1" });
    mockStatus.mockResolvedValue({
      state: "done",
      extraction_id: null,
    } satisfies ExtractJobStatus);

    const { result } = renderHook(() => useExtract());
    await act(async () => {
      await result.current.extract(file());
    });

    expect(result.current.state).toBe("error");
    expect(mockDetail).not.toHaveBeenCalled();
  });

  it("retries a transient poll error, then succeeds", async () => {
    vi.useFakeTimers();
    try {
      mockSubmit.mockResolvedValue({ task_id: "t1" });
      mockStatus
        .mockRejectedValueOnce(new Error("network blip"))
        .mockResolvedValueOnce({ state: "done", extraction_id: 5 } satisfies ExtractJobStatus);
      mockDetail.mockResolvedValue(makeMockResponse());

      const { result } = renderHook(() => useExtract());
      let done!: Promise<void>;
      act(() => {
        done = result.current.extract(file());
      });

      // Failed poll → 1s delay → retry returns "done".
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
        await done;
      });

      expect(mockStatus).toHaveBeenCalledTimes(2);
      expect(result.current.state).toBe("success");
    } finally {
      vi.useRealTimers();
    }
  });

  it("polls while processing, then resolves to success", async () => {
    vi.useFakeTimers();
    try {
      mockSubmit.mockResolvedValue({ task_id: "t1" });
      mockStatus
        .mockResolvedValueOnce({ state: "processing" } satisfies ExtractJobStatus)
        .mockResolvedValueOnce({ state: "done", extraction_id: 5 } satisfies ExtractJobStatus);
      mockDetail.mockResolvedValue(makeMockResponse());

      const { result } = renderHook(() => useExtract());
      let done!: Promise<void>;
      act(() => {
        done = result.current.extract(file());
      });

      // First poll returns "processing"; advance past the 1s delay so the
      // second poll ("done") runs.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
        await done;
      });

      expect(mockStatus).toHaveBeenCalledTimes(2);
      expect(result.current.state).toBe("success");
    } finally {
      vi.useRealTimers();
    }
  });

  it('reset() returns state to "idle" and clears result and errorMessage', async () => {
    mockSubmit.mockResolvedValue({ task_id: "t1" });
    mockStatus.mockResolvedValue({ state: "done", extraction_id: 5 } satisfies ExtractJobStatus);
    mockDetail.mockResolvedValue(makeMockResponse());

    const { result } = renderHook(() => useExtract());
    await act(async () => {
      await result.current.extract(file());
    });
    expect(result.current.state).toBe("success");

    act(() => result.current.reset());

    expect(result.current.state).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });
});
