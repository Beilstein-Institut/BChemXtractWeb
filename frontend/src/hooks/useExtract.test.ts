/**
 * Tests for useExtract hook.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * The postExtract API client is mocked here so we can test the hook's
 * state machine in isolation. See apiClient.test.ts for postExtract tests.
 */
import { renderHook, act } from "@testing-library/react";
import { vi, beforeEach } from "vitest";
import type { ExtractionResponse } from "../types/chemistry";

// Mock the apiClient module so we can control postExtract's behavior
vi.mock("../lib/apiClient", () => ({
  postExtract: vi.fn(),
}));

import { useExtract } from "./useExtract";
import { postExtract } from "../lib/apiClient";

const mockPostExtract = postExtract as ReturnType<typeof vi.fn>;

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

describe("useExtract hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ExtractState union covers exactly "idle" | "loading" | "success" | "error"', () => {
    // Type-level test: verify the hook returns one of the 4 states
    const { result } = renderHook(() => useExtract());
    expect(["idle", "loading", "success", "error"]).toContain(result.current.state);
  });

  it('initial state is { state: "idle", result: null, errorMessage: null }', () => {
    const { result } = renderHook(() => useExtract());
    expect(result.current.state).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('extract() transitions state from "idle" to "loading"', async () => {
    // Delay resolution so we can observe loading state
    let resolve!: (v: ExtractionResponse) => void;
    mockPostExtract.mockReturnValue(new Promise<ExtractionResponse>((r) => { resolve = r; }));

    const { result } = renderHook(() => useExtract());
    const file = new File(["data"], "test.cdx", { type: "chemical/x-cdx" });

    act(() => {
      void result.current.extract(file);
    });

    expect(result.current.state).toBe("loading");

    // Clean up: resolve the promise
    await act(async () => { resolve(makeMockResponse()); });
  });

  it('transitions to "success" with result set when postExtract resolves', async () => {
    const mockResponse = makeMockResponse();
    mockPostExtract.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useExtract());
    const file = new File(["data"], "test.cdx");

    await act(async () => {
      await result.current.extract(file);
    });

    expect(result.current.state).toBe("success");
    expect(result.current.result).toEqual(mockResponse);
    expect(result.current.errorMessage).toBeNull();
  });

  it('transitions to "error" with errorMessage when postExtract rejects with an Error', async () => {
    mockPostExtract.mockRejectedValue(new Error("Extraction failed — bad file"));

    const { result } = renderHook(() => useExtract());
    const file = new File(["data"], "test.cdx");

    await act(async () => {
      await result.current.extract(file);
    });

    expect(result.current.state).toBe("error");
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBe("Extraction failed — bad file");
  });

  it('reset() returns state to "idle" and clears result and errorMessage', async () => {
    const mockResponse = makeMockResponse();
    mockPostExtract.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useExtract());
    const file = new File(["data"], "test.cdx");

    await act(async () => {
      await result.current.extract(file);
    });
    expect(result.current.state).toBe("success");

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });
});
