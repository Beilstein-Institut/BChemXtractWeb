import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useExtract, type UseExtractReturn } from "./hooks/useExtract";
import type { ExtractionResponse } from "./types/chemistry";

vi.mock("./hooks/useExtract", () => ({ useExtract: vi.fn() }));
vi.mock("./hooks/useBatch", () => ({
  useBatch: () => ({
    state: "idle",
    files: [],
    batchId: null,
    completedCount: 0,
    failedCount: 0,
    totalStructures: 0,
    errorMessage: null,
    startBatch: vi.fn(),
    cancelBatch: vi.fn(),
    reset: vi.fn(),
  }),
}));
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
vi.mock("./lib/apiClient", () => ({
  getExtractionReactions: vi.fn().mockResolvedValue({ reactions: [] }),
}));
vi.mock("./components/FileUpload", () => ({
  FileUpload: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="file-upload" data-loading={isLoading}>
      FileUpload
    </div>
  ),
}));
vi.mock("./components/StructureBrowser", () => ({
  StructureBrowser: () => <div data-testid="structure-browser">StructureBrowser</div>,
}));
vi.mock("./components/ExtractionTabs", () => ({
  ExtractionTabs: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="extraction-tabs">{children}</div>
  ),
}));
vi.mock("./components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header">AppHeader</header>,
}));
vi.mock("sonner", () => ({ Toaster: () => null, toast: { error: vi.fn() } }));

const SUCCESS_RESULT: ExtractionResponse = {
  substances: [],
  info: { no_fragments: 0, no_inchis: 0, no_substances: 0 },
  format: "cdx",
  filename: "test.cdx",
  file_size: 100,
  structure_count: 0,
  extraction_time_ms: 500,
  warnings: [],
  extraction_id: 42,
};

function setPathname(pathname: string) {
  window.history.replaceState(null, "", pathname);
}

function mockExtract(overrides: Partial<UseExtractReturn> = {}) {
  vi.mocked(useExtract).mockReturnValue({
    state: "idle",
    result: null,
    errorMessage: null,
    extract: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  });
}

describe("App", () => {
  beforeEach(() => {
    setPathname("/");
    mockExtract();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the hero tagline on /", () => {
    render(<App />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/ChemDraw, read back\./i);
  });

  it("shows FileUpload in idle state on /", () => {
    render(<App />);
    expect(screen.getByTestId("file-upload")).toBeInTheDocument();
  });

  it("advances the wizard to the Process step in loading state", () => {
    mockExtract({ state: "loading" });
    render(<App />);
    const stepper = document.querySelector("[data-slot='wizard-stepper']") as HTMLElement | null;
    expect(stepper).not.toBeNull();
    expect(stepper!.dataset.current).toBe("process");
  });

  it("auto-navigates to /browse when extraction succeeds on /", () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    mockExtract({ state: "success", result: SUCCESS_RESULT });
    render(<App />);
    expect(pushSpy).toHaveBeenCalledWith(null, "", "/browse");
  });

  it("does NOT auto-navigate when user is on /history during success", () => {
    setPathname("/history");
    const pushSpy = vi.spyOn(window.history, "pushState");
    mockExtract({ state: "success", result: SUCCESS_RESULT });
    render(<App />);
    const browseCalls = pushSpy.mock.calls.filter((call) => call[2] === "/browse");
    expect(browseCalls).toHaveLength(0);
  });
});
