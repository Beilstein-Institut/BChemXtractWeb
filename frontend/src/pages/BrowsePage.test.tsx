/**
 * BrowsePage — bento landing integration tests.
 *
 * Covers:
 *   - empty-state render when no extraction is active
 *   - bento grid + structure browser render when an extraction is loaded
 *   - page-wide depiction default + toolbar toggle
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import type { ExtractionResponse, SubstanceResponse } from "@/types/chemistry";

// StructureBrowser talks to useBrowse / apiClient — mock it out so the
// page-level test stays focused on the bento + tabs wiring.
vi.mock("@/components/StructureBrowser", () => ({
  StructureBrowser: (props: {
    extractionId: number | null | undefined;
    depiction?: string;
    onDepictionChange?: (d: "cdx" | "cdk") => void;
  }) => (
    <div
      data-testid="structure-browser"
      data-extraction-id={props.extractionId ?? ""}
      data-depiction={props.depiction ?? ""}
    >
      {/* Stand-in for the toolbar's ChemDraw/CDK toggle. */}
      <button
        data-testid="mock-depiction-switch"
        onClick={() => props.onDepictionChange?.("cdk")}
      />
    </div>
  ),
}));

vi.mock("@/components/ExtractionTabs", () => ({
  ExtractionTabs: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="extraction-tabs">{children}</div>
  ),
}));

import { BrowsePage, type BrowsePageProps } from "./BrowsePage";

function makeSubstance(overrides: Partial<SubstanceResponse> = {}): SubstanceResponse {
  return {
    id: overrides.id ?? 1,
    inchi: "InChI=1S/C6H6",
    inchi_key: `KEY-${overrides.id ?? 1}`,
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

function makeResponse(
  substances: SubstanceResponse[],
  overrides: Partial<ExtractionResponse> = {},
): ExtractionResponse {
  return {
    substances,
    info: {
      no_fragments: substances.length,
      no_inchis: substances.length,
      no_substances: substances.length,
    },
    format: "cdxml",
    filename: "sample.cdxml",
    file_size: 1024,
    structure_count: substances.length,
    extraction_time_ms: 100,
    warnings: [],
    extraction_id: 42,
    ...overrides,
  };
}

function makeProps(overrides: Partial<BrowsePageProps> = {}): BrowsePageProps {
  return {
    activeExtractionId: null,
    activeResult: null,
    isHistoricalView: false,
    selectedFile: null,
    cachedReactionsData: null,
    liveReactionCount: 0,
    onReset: vi.fn(),
    onBackToLatest: vi.fn(),
    onSearchWithin: vi.fn(),
    onReactionsCountChange: vi.fn(),
    ...overrides,
  };
}

describe("BrowsePage", () => {
  it("shows the empty state when no extraction is active", () => {
    render(<BrowsePage {...makeProps()} />);
    expect(screen.getByText(/no extraction loaded/i)).toBeInTheDocument();
    expect(screen.queryByTestId("structure-browser")).toBeNull();
  });

  it("renders the bento grid + structure browser when an extraction is active", () => {
    const substances = [
      makeSubstance({ id: 1, molecular_formula: "C6H6", iupac_name: "benzene" }),
      makeSubstance({ id: 2, molecular_formula: "H2O", iupac_name: "water" }),
    ];
    const { container } = render(
      <BrowsePage
        {...makeProps({
          activeExtractionId: 42,
          activeResult: makeResponse(substances),
        })}
      />,
    );

    expect(container.querySelector('[data-slot="browse-bento"]')).not.toBeNull();
    expect(screen.getByTestId("structure-browser")).toBeInTheDocument();
  });

  it("defaults the page depiction to CDK (cdk)", () => {
    render(
      <BrowsePage
        {...makeProps({
          activeExtractionId: 42,
          activeResult: makeResponse([makeSubstance()]),
        })}
      />,
    );
    expect(screen.getByTestId("structure-browser").getAttribute("data-depiction")).toBe("cdk");
  });

  it("flips the depiction page-wide when the toolbar toggle fires", () => {
    render(
      <BrowsePage
        {...makeProps({
          activeExtractionId: 42,
          activeResult: makeResponse([makeSubstance()]),
        })}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByTestId("mock-depiction-switch"));
    });

    expect(screen.getByTestId("structure-browser").getAttribute("data-depiction")).toBe("cdk");
  });

  it("renders the historical view banner when isHistoricalView=true", () => {
    render(
      <BrowsePage
        {...makeProps({
          activeExtractionId: 42,
          activeResult: makeResponse([makeSubstance()]),
          isHistoricalView: true,
        })}
      />,
    );
    expect(screen.getByText(/viewing past extraction: sample\.cdxml/i)).toBeInTheDocument();
  });
});
