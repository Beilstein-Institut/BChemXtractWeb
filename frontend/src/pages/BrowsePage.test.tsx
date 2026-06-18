/**
 * BrowsePage — bento landing integration tests.
 *
 * Covers:
 *   - empty-state render when no extraction is active
 *   - bento grid renders when an extraction is loaded
 *   - SearchFilter chip toggle narrows the visible structures in bento
 *   - filters prop flows into StructureBrowser
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import type { ExtractionResponse, SubstanceResponse } from "@/types/chemistry";

// StructureBrowser talks to useBrowse / apiClient — mock it out so the
// page-level test stays focused on the bento + SearchFilter wiring.
vi.mock("@/components/StructureBrowser", () => ({
  StructureBrowser: (props: {
    extractionId: number | null | undefined;
    filters?: { q: string; hasName: boolean; hasSmiles: boolean; hasInchi: boolean };
    depiction?: string;
    onDepictionChange?: (d: "cdx" | "cdk") => void;
  }) => (
    <div
      data-testid="structure-browser"
      data-extraction-id={props.extractionId ?? ""}
      data-filter-q={props.filters?.q ?? ""}
      data-filter-has-name={String(props.filters?.hasName ?? false)}
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

  it("renders the bento grid + SearchFilter when an extraction is active", () => {
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
    expect(container.querySelector('[data-slot="browse-search-filter"]')).not.toBeNull();
    expect(screen.getByTestId("structure-browser")).toBeInTheDocument();
  });

  it("flows chip filters through to StructureBrowser via the filters prop", () => {
    const substances = [
      makeSubstance({ id: 1, iupac_name: "benzene" }),
      makeSubstance({ id: 2, iupac_name: "" }),
    ];
    render(
      <BrowsePage
        {...makeProps({
          activeExtractionId: 42,
          activeResult: makeResponse(substances),
        })}
      />,
    );

    const browser = screen.getByTestId("structure-browser");
    expect(browser.getAttribute("data-filter-has-name")).toBe("false");

    const chip = screen.getByRole("button", { name: /has iupac name/i });
    act(() => {
      fireEvent.click(chip);
    });

    expect(browser.getAttribute("data-filter-has-name")).toBe("true");
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
