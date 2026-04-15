import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import App from "./App";

// Mock all child components to isolate App wiring logic
vi.mock("./hooks/useExtract");
vi.mock("./components/FileUpload", () => ({
  FileUpload: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="file-upload" data-loading={isLoading}>FileUpload</div>
  ),
}));
vi.mock("./components/ExtractionSummary", () => ({
  ExtractionSummary: () => <div data-testid="extraction-summary">ExtractionSummary</div>,
}));
vi.mock("./components/StructureBrowser", () => ({
  StructureBrowser: () => <div data-testid="structure-browser">StructureBrowser</div>,
}));
vi.mock("./components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header">AppHeader</header>,
}));
vi.mock("sonner", () => ({ Toaster: () => null, toast: { error: vi.fn() } }));

const { useExtract } = await import("./hooks/useExtract");

describe("App", () => {
  it("renders the heading", () => {
    vi.mocked(useExtract).mockReturnValue({
      state: "idle", result: null, errorMessage: null,
      extract: vi.fn(), reset: vi.fn(),
    });
    render(<App />);
    expect(screen.getByText("BChemXtractWeb")).toBeInTheDocument();
  });

  it("renders the description", () => {
    vi.mocked(useExtract).mockReturnValue({
      state: "idle", result: null, errorMessage: null,
      extract: vi.fn(), reset: vi.fn(),
    });
    render(<App />);
    expect(
      screen.getByText("Extract chemical structures from ChemDraw files."),
    ).toBeInTheDocument();
  });

  it("shows FileUpload in idle state", () => {
    vi.mocked(useExtract).mockReturnValue({
      state: "idle", result: null, errorMessage: null,
      extract: vi.fn(), reset: vi.fn(),
    });
    render(<App />);
    expect(screen.getByTestId("file-upload")).toBeInTheDocument();
    expect(screen.queryByTestId("extraction-summary")).not.toBeInTheDocument();
  });

  it("shows FileUpload with isLoading=true in loading state", () => {
    vi.mocked(useExtract).mockReturnValue({
      state: "loading", result: null, errorMessage: null,
      extract: vi.fn(), reset: vi.fn(),
    });
    render(<App />);
    const fileUpload = screen.getByTestId("file-upload");
    expect(fileUpload).toHaveAttribute("data-loading", "true");
  });

  it("shows ExtractionSummary and StructureBrowser in success state", () => {
    vi.mocked(useExtract).mockReturnValue({
      state: "success",
      result: {
        substances: [], info: { no_fragments: 0, no_inchis: 0, no_substances: 0 },
        format: "cdx", filename: "test.cdx", file_size: 100,
        structure_count: 0, extraction_time_ms: 500, warnings: [],
      },
      errorMessage: null, extract: vi.fn(), reset: vi.fn(),
    });
    render(<App />);
    expect(screen.getByTestId("extraction-summary")).toBeInTheDocument();
    expect(screen.getByTestId("structure-browser")).toBeInTheDocument();
    expect(screen.queryByTestId("file-upload")).not.toBeInTheDocument();
  });
});
