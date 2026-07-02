/**
 * Tests for StructureBrowser orchestrator component.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * useBrowse and all child components are mocked for isolation.
 */
import { render, screen } from "@testing-library/react";
import { vi, beforeEach } from "vitest";
import type { UseBrowseReturn, BrowseView, BrowseSort } from "@/hooks/useBrowse";
import type { PagedSubstancesResponse, PubChemEnrichment } from "@/types/chemistry";

// Mock useBrowse hook
const mockUseBrowse = vi.fn();
vi.mock("@/hooks/useBrowse", () => ({
  useBrowse: (...args: unknown[]) => mockUseBrowse(...args),
}));

// Mock child components to avoid their internal complexity
vi.mock("@/components/BrowseToolbar", () => ({
  BrowseToolbar: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid="browse-toolbar" data-disabled={disabled} />
  ),
}));

vi.mock("@/components/StructureCard", () => ({
  StructureCard: ({
    substance,
    pubchem,
  }: {
    substance: { molecular_formula: string };
    pubchem?: { data?: { cid?: number | null } };
  }) => (
    <div data-testid="structure-card" data-pubchem-cid={pubchem?.data?.cid ?? ""}>
      {substance.molecular_formula}
    </div>
  ),
}));

vi.mock("@/components/StructureTable", () => ({
  StructureTable: () => <div data-testid="structure-table" />,
}));

vi.mock("@/components/StructureSheet", () => ({
  StructureSheet: ({ open }: { open: boolean }) => (
    <div data-testid="structure-sheet" data-open={open} />
  ),
}));

// Mock pagination components to avoid a tag rendering complexity
vi.mock("@/components/ui/pagination", () => ({
  Pagination: ({ children }: { children: React.ReactNode }) => (
    <nav data-testid="pagination">{children}</nav>
  ),
  PaginationContent: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
  PaginationItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
  PaginationLink: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  PaginationPrevious: ({ onClick }: { onClick?: () => void }) => (
    <button onClick={onClick}>Previous</button>
  ),
  PaginationNext: ({ onClick }: { onClick?: () => void }) => (
    <button onClick={onClick}>Next</button>
  ),
  PaginationEllipsis: () => <span>...</span>,
}));

// Mock skeleton
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

// Mock button
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
  }) => (
    <button onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
}));

function makeBrowseReturn(overrides: Partial<UseBrowseReturn> = {}): UseBrowseReturn {
  return {
    browseState: "success",
    page: null,
    view: "grid" as BrowseView,
    sort: "extraction_order" as BrowseSort,
    pageSize: 12,
    currentPage: 1,
    selectedIds: new Set<number>(),
    setView: vi.fn(),
    setSort: vi.fn(),
    setPageSize: vi.fn(),
    goToPage: vi.fn(),
    toggleSelect: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    ...overrides,
  };
}

import { StructureBrowser } from "./StructureBrowser";

describe("StructureBrowser component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders BrowseToolbar when extractionId is provided", () => {
    mockUseBrowse.mockReturnValue(makeBrowseReturn({ browseState: "success" }));
    render(<StructureBrowser extractionId={42} onReset={vi.fn()} />);
    expect(screen.getByTestId("browse-toolbar")).toBeInTheDocument();
  });

  it("shows skeleton loading cards when browseState=loading and page=null", () => {
    mockUseBrowse.mockReturnValue(makeBrowseReturn({ browseState: "loading", page: null }));
    render(<StructureBrowser extractionId={42} onReset={vi.fn()} />);
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows error EmptyState when browseState=error (D-19)", () => {
    mockUseBrowse.mockReturnValue(makeBrowseReturn({ browseState: "error" }));
    render(<StructureBrowser extractionId={42} onReset={vi.fn()} />);
    // Migrated from inline block to shared <EmptyState>.
    expect(screen.getByText("Couldn't load structures")).toBeInTheDocument();
    expect(screen.getByText("Check your connection and try again.")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("shows browse EmptyState when browseState=success and items is empty (D-19)", () => {
    const emptyPage: PagedSubstancesResponse = {
      items: [],
      total: 0,
      page: 1,
      size: 12,
      pages: 0,
    };
    mockUseBrowse.mockReturnValue(makeBrowseReturn({ browseState: "success", page: emptyPage }));
    render(<StructureBrowser extractionId={42} onReset={vi.fn()} />);
    // Migrated from inline FlaskConicalIcon block to shared EmptyState.
    expect(screen.getByText("Nothing to browse yet")).toBeInTheDocument();
  });

  it("renders StructureCard items in grid view when substances exist", () => {
    const testPage: PagedSubstancesResponse = {
      items: [
        {
          id: 1,
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
        },
      ],
      total: 1,
      page: 1,
      size: 12,
      pages: 1,
    };
    mockUseBrowse.mockReturnValue(
      makeBrowseReturn({
        browseState: "success",
        page: testPage,
        view: "grid",
      }),
    );
    render(<StructureBrowser extractionId={42} onReset={vi.fn()} />);
    expect(screen.getByTestId("structure-card")).toBeInTheDocument();
    expect(screen.getByText("C6H6")).toBeInTheDocument();
  });

  it("always renders StructureSheet (controlled open state)", () => {
    mockUseBrowse.mockReturnValue(makeBrowseReturn({ browseState: "success" }));
    render(<StructureBrowser extractionId={42} onReset={vi.fn()} />);
    expect(screen.getByTestId("structure-sheet")).toBeInTheDocument();
  });

  it("toolbar is disabled during initial loading when page is null", () => {
    mockUseBrowse.mockReturnValue(makeBrowseReturn({ browseState: "loading", page: null }));
    render(<StructureBrowser extractionId={42} onReset={vi.fn()} />);
    const toolbar = screen.getByTestId("browse-toolbar");
    expect(toolbar.getAttribute("data-disabled")).toBe("true");
  });
});

describe("StructureBrowser PubChem prop threading", () => {
  const KEY = "UHOVQNZJYSORNB-UHFFFAOYSA-N";
  const onePage: PagedSubstancesResponse = {
    items: [
      {
        id: 1,
        inchi: "",
        inchi_key: KEY,
        smiles: "c1ccccc1",
        extended_smiles: "",
        iupac_name: "",
        molecular_formula: "C6H6",
        aux_info: "",
        mdlv3000: "",
        abbreviations: {},
        svg: "",
      },
    ],
    total: 1,
    page: 1,
    size: 12,
    pages: 1,
  };
  const enrichment: PubChemEnrichment = {
    inchi_key: KEY,
    status: "exact",
    cid: 241,
    iupac_name: null,
    molecular_formula: "C6H6",
    molecular_weight: null,
    canonical_smiles: null,
    isomeric_smiles: null,
    xlogp: null,
    pubchem_url: "https://pubchem.ncbi.nlm.nih.gov/compound/241",
    connectivity_cid_count: 0,
    title: null,
    synonyms: [],
    description: null,
    description_source: null,
  };

  // Enrichment is now owned by the parent (BrowsePage) and passed down as the
  // `pubchem` map, so the grid no longer fires its own lookups — it just
  // renders whatever map it is given onto the cards.
  it("renders the enrichment passed via the pubchem prop onto cards", () => {
    mockUseBrowse.mockReturnValue(makeBrowseReturn({ browseState: "success", page: onePage }));
    render(
      <StructureBrowser
        extractionId={42}
        onReset={vi.fn()}
        pubchem={new Map([[KEY, { state: "success", data: enrichment }]])}
      />,
    );
    expect(screen.getByTestId("structure-card").getAttribute("data-pubchem-cid")).toBe("241");
  });

  it("renders no PubChem chrome when no map is provided", () => {
    mockUseBrowse.mockReturnValue(makeBrowseReturn({ browseState: "success", page: onePage }));
    render(<StructureBrowser extractionId={42} onReset={vi.fn()} />);
    expect(screen.getByTestId("structure-card").getAttribute("data-pubchem-cid")).toBe("");
  });
});
