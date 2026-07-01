/**
 * Integration reproduction: a batch-uploaded file, viewed in the same session,
 * must reach the Browse page WITH its File in memory so the Reactions tab can
 * extract on-demand instead of prompting a re-upload.
 *
 * Uses the REAL useBatch hook (App.test.tsx mocks it, so it never exercised
 * this seam) and the real BrowsePage/ExtractionTabs/ReactionsTab, asserting the
 * on-demand CTA appears instead of the re-upload prompt.
 */
import { act } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useExtract } from "./hooks/useExtract";

vi.mock("./hooks/useExtract", () => ({ useExtract: vi.fn() }));
vi.mock("./hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("./hooks/useCsrfToken", () => ({ useCsrfToken: vi.fn() }));
vi.mock("./hooks/useHistory", () => ({
  useHistory: () => ({
    historyState: "idle",
    entries: [],
    total: 0,
    showAll: false,
    stats: null,
    statsLoading: false,
    toggleShowAll: vi.fn(),
    deleteEntry: vi.fn(),
    reloadEntry: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const getHistoryDetail = vi.fn();
vi.mock("./lib/apiClient", () => ({
  postBatchStart: vi.fn().mockResolvedValue({
    batch_id: "bid",
    group_id: "gid",
    task_ids: ["t1"],
    file_count: 1,
  }),
  getBatchSSEUrl: (id: string) => `/api/batch/${id}/progress`,
  getHistoryDetail: (id: number) => getHistoryDetail(id),
  getExtractionReactions: vi.fn().mockResolvedValue({ reactions: [] }),
  getPubChemStatus: vi.fn().mockResolvedValue({ enabled: false }),
  downloadBatchZip: vi.fn(),
  cancelBatch: vi.fn(),
}));

// FileUpload → a button that starts a batch with multiple reaction files.
vi.mock("./components/FileUpload", () => ({
  FileUpload: ({ onStartBatch }: { onStartBatch: (files: File[]) => void }) => (
    <button
      onClick={() => onStartBatch([new File(["a"], "rxn1.cdx"), new File(["b"], "rxn2.cdx")])}
    >
      start-batch
    </button>
  ),
}));

// Keep BrowsePage REAL (that's the seam under test), but mock its heavy,
// unrelated siblings so the render stays light and network-free. ExtractionTabs
// + ReactionsTab stay real — they decide the "Extract" vs "Re-upload" branch.
vi.mock("./components/StructureBrowser", () => ({
  StructureBrowser: () => <div>StructureBrowser</div>,
}));
vi.mock("./components/browse/BrowseBento", () => ({ BrowseBento: () => <div>BrowseBento</div> }));
vi.mock("./components/SearchFilter", () => ({ SearchFilter: () => <div>SearchFilter</div> }));
vi.mock("./components/StructureSheet", () => ({ StructureSheet: () => null }));

vi.mock("sonner", () => ({ Toaster: () => null, toast: { error: vi.fn(), success: vi.fn() } }));

// EventSource: capture the handlers the hook registers so the test can drive
// file_complete / batch_complete as the server would.
let sse: Record<string, (e: MessageEvent) => void> = {};
class MockEventSource {
  addEventListener(type: string, cb: (e: MessageEvent) => void) {
    sse[type] = cb;
  }
  close() {}
}
vi.stubGlobal("EventSource", MockEventSource);

describe("batch file → view → reactions (in-session)", () => {
  beforeEach(() => {
    sse = {};
    window.history.replaceState(null, "", "/");
    vi.mocked(useExtract).mockReturnValue({
      state: "idle",
      result: null,
      errorMessage: null,
      extract: vi.fn(),
      reset: vi.fn(),
    });
    // Return the detail matching whichever extraction id is viewed.
    getHistoryDetail.mockImplementation((id: number) =>
      Promise.resolve({
        substances: [],
        info: { no_fragments: 0, no_inchis: 0, no_substances: 0 },
        format: "cdx",
        filename: id === 43 ? "rxn2.cdx" : "rxn1.cdx",
        file_size: 1,
        structure_count: 0,
        extraction_time_ms: 1,
        warnings: [],
        extraction_id: id,
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Run a 2-file batch to completion, then open the SECOND file in Browse.
  async function batchThenViewSecond(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByText("start-batch"));
    await act(async () => {
      sse.file_complete({
        data: JSON.stringify({
          task_id: "t1",
          state: "SUCCESS",
          result: { filename: "rxn1.cdx", structure_count: 0, extraction_id: 42, error: null },
        }),
      } as MessageEvent);
      sse.file_complete({
        data: JSON.stringify({
          task_id: "t2",
          state: "SUCCESS",
          result: { filename: "rxn2.cdx", structure_count: 0, extraction_id: 43, error: null },
        }),
      } as MessageEvent);
      sse.batch_complete({} as MessageEvent);
    });
    const viewButtons = await screen.findAllByRole("button", { name: "View" });
    expect(viewButtons).toHaveLength(2);
    await user.click(viewButtons[1]);
  }

  it("hands the just-uploaded batch file to Browse (no re-upload), even the 2nd of many", async () => {
    const user = userEvent.setup();
    render(<App />);
    await batchThenViewSecond(user);

    // Open the Reactions tab and assert the on-demand CTA — NOT the re-upload
    // prompt from the screenshot.
    await user.click(await screen.findByRole("tab", { name: /Reactions/ }));
    expect(await screen.findByText(/Extract reactions from this file/i)).toBeInTheDocument();
    expect(screen.queryByText(/Re-upload to extract reactions/i)).not.toBeInTheDocument();
  });

  it("'Back to latest' from a batch file returns to the batch results, not an empty Browse", async () => {
    const user = userEvent.setup();
    render(<App />);
    await batchThenViewSecond(user);

    // On the historical Browse view of a batch file.
    await user.click(await screen.findByRole("button", { name: /Back to latest/i }));

    // Must land back on the Extract page's batch results — NOT the empty
    // "No extraction loaded" void.
    expect(await screen.findByText(/Batch complete/i)).toBeInTheDocument();
    expect(screen.queryByText(/No extraction loaded/i)).not.toBeInTheDocument();
  });
});
