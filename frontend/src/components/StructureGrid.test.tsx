/**
 * Tests for StructureGrid and ExtractionSummary components.
 * Vitest globals: true — no need to import describe/it/expect.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, beforeEach } from "vitest";
import type { SubstanceResponse, ExtractionResponse } from "@/types/chemistry";

// Mock StructureCard since it depends on Dialog/Tooltip (complex render)
vi.mock("./StructureCard", () => ({
  StructureCard: ({ substance }: { substance: SubstanceResponse }) => (
    <div data-testid="structure-card">{substance.molecular_formula}</div>
  ),
}));

// Mock @base-ui/react/button to a simple <button> in tests
vi.mock("@base-ui/react/button", () => {
  const React = require("react");
  return {
    Button: React.forwardRef(
      (
        { children, className, ...props }: React.ComponentProps<"button">,
        ref: React.Ref<HTMLButtonElement>,
      ) => React.createElement("button", { ref, className, ...props }, children),
    ),
  };
});

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

function makeSubstance(overrides: Partial<SubstanceResponse> = {}): SubstanceResponse {
  return {
    inchi: "InChI=1S/C6H6",
    inchi_key: "UHOVQNZJYSORNB-UHFFFAOYSA-N",
    smiles: "c1ccccc1",
    extended_smiles: "c1ccccc1",
    iupac_name: "benzene",
    molecular_formula: "C6H6",
    aux_info: "",
    mdlv3000: "",
    abbreviations: {},
    svg: "",
    ...overrides,
  };
}

function makeResponse(overrides: Partial<ExtractionResponse> = {}): ExtractionResponse {
  return {
    substances: [],
    info: { no_fragments: 0, no_inchis: 0, no_substances: 0 },
    format: "cdx",
    filename: "test.cdx",
    file_size: 1024,
    structure_count: 0,
    extraction_time_ms: 1500,
    warnings: [],
    ...overrides,
  };
}

import { StructureGrid } from "./StructureGrid";
import { ExtractionSummary } from "./ExtractionSummary";

// ---------------------------------------------------------------------------
// StructureGrid tests
// ---------------------------------------------------------------------------

describe("StructureGrid component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 3 StructureCard elements when substances has 3 items", () => {
    const substances = [
      makeSubstance({ inchi_key: "KEY1", molecular_formula: "C6H6" }),
      makeSubstance({ inchi_key: "KEY2", molecular_formula: "C2H6" }),
      makeSubstance({ inchi_key: "KEY3", molecular_formula: "CH4" }),
    ];
    const response = makeResponse({ substances, structure_count: 3 });
    render(<StructureGrid response={response} onReset={vi.fn()} />);
    expect(screen.getAllByTestId("structure-card")).toHaveLength(3);
  });

  it('rendered grid div has Tailwind class "grid" and "grid-cols-1"', () => {
    const substances = [makeSubstance()];
    const response = makeResponse({ substances, structure_count: 1 });
    render(<StructureGrid response={response} onReset={vi.fn()} />);
    const grid = document.querySelector(".grid.grid-cols-1");
    expect(grid).not.toBeNull();
  });

  it('rendered grid div has "md:grid-cols-2" and "lg:grid-cols-3" classes', () => {
    const substances = [makeSubstance()];
    const response = makeResponse({ substances, structure_count: 1 });
    render(<StructureGrid response={response} onReset={vi.fn()} />);
    // Check the grid element has these responsive classes
    const grid = document.querySelector('[class*="md:grid-cols-2"]');
    expect(grid).not.toBeNull();
    const grid2 = document.querySelector('[class*="lg:grid-cols-3"]');
    expect(grid2).not.toBeNull();
  });

  it('renders "No structures found" heading when structure_count is 0', () => {
    const response = makeResponse({ structure_count: 0, substances: [] });
    render(<StructureGrid response={response} onReset={vi.fn()} />);
    expect(screen.getByText("No structures found")).toBeInTheDocument();
  });

  it('renders "Upload another file" button when structure_count is 0', () => {
    const response = makeResponse({ structure_count: 0, substances: [] });
    render(<StructureGrid response={response} onReset={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Upload another file" })).toBeInTheDocument();
  });

  it('calls onReset when "Upload another file" is clicked in empty state', () => {
    const onReset = vi.fn();
    const response = makeResponse({ structure_count: 0, substances: [] });
    render(<StructureGrid response={response} onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload another file" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// ExtractionSummary tests
// ---------------------------------------------------------------------------

describe("ExtractionSummary component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the filename text from response.filename", () => {
    const response = makeResponse({ filename: "benzene.cdx", structure_count: 3 });
    render(<ExtractionSummary response={response} onReset={vi.fn()} />);
    expect(screen.getByText(/benzene\.cdx/)).toBeInTheDocument();
  });

  it('renders "1 structure" (singular) when structure_count is 1', () => {
    const response = makeResponse({ structure_count: 1 });
    render(<ExtractionSummary response={response} onReset={vi.fn()} />);
    expect(screen.getByText(/1 structure[^s]/)).toBeInTheDocument();
  });

  it('renders "3 structures" (plural) when structure_count is 3', () => {
    const response = makeResponse({ structure_count: 3 });
    render(<ExtractionSummary response={response} onReset={vi.fn()} />);
    expect(screen.getByText(/3 structures/)).toBeInTheDocument();
  });

  it('renders extraction time as "1.5s" when extraction_time_ms is 1500', () => {
    const response = makeResponse({ extraction_time_ms: 1500 });
    render(<ExtractionSummary response={response} onReset={vi.fn()} />);
    expect(screen.getByText(/1\.5s/)).toBeInTheDocument();
  });

  it('renders "Upload another file" button that calls onReset when clicked', () => {
    const onReset = vi.fn();
    const response = makeResponse();
    render(<ExtractionSummary response={response} onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload another file" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("does NOT render the amber Alert when warnings array is empty", () => {
    const response = makeResponse({ warnings: [] });
    render(<ExtractionSummary response={response} onReset={vi.fn()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders Alert with role=alert containing warning text when warnings has 1 item", () => {
    const response = makeResponse({ warnings: ["Reaction extraction failed for page 2"] });
    render(<ExtractionSummary response={response} onReset={vi.fn()} />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Reaction extraction failed for page 2");
  });

  it("clicking the dismiss button on the Alert hides the Alert", () => {
    const response = makeResponse({ warnings: ["Some warning"] });
    render(<ExtractionSummary response={response} onReset={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss warning" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
