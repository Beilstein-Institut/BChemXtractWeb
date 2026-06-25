/**
 * Tests for StructureDetail component.
 * Vitest globals: true — no need to import describe/it/expect.
 */
import { render, screen } from "@testing-library/react";
import { vi, beforeEach } from "vitest";
import type { SubstanceResponse } from "@/types/chemistry";

// Mock navigator.clipboard
Object.defineProperty(navigator, "clipboard", {
  writable: true,
  value: {
    writeText: vi.fn(),
  },
});

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

// Mock @base-ui/react/dialog
vi.mock("@base-ui/react/dialog", () => {
  const React = require("react");
  return {
    Dialog: {
      Root: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Trigger: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Backdrop: () => React.createElement("div", { "data-testid": "dialog-backdrop" }),
      Popup: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement(
          "div",
          { "data-testid": "dialog-popup", role: "dialog", className },
          children,
        ),
      Close: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("button", { "data-testid": "dialog-close" }, children),
      Title: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("h2", { "data-testid": "dialog-title", className }, children),
      Description: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("p", { "data-testid": "dialog-description", className }, children),
    },
  };
});

// Mock @base-ui/react/button
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

const mockSubstance: SubstanceResponse = {
  inchi: "InChI=1S/C6H6/c1-2-4-6-5-3-1/h1-6H",
  inchi_key: "UHOVQNZJYSORNB-UHFFFAOYSA-N",
  smiles: "c1ccccc1",
  extended_smiles: "c1ccccc1",
  iupac_name: "benzene",
  molecular_formula: "C6H6",
  aux_info: "",
  mdlv3000: "M  V30 BEGIN CTAB",
  abbreviations: {},
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="450" height="450"><circle cx="225" cy="225" r="100"/></svg>',
};

const mockSubstanceNoMdl: SubstanceResponse = {
  ...mockSubstance,
  mdlv3000: "",
};

import { StructureDetail } from "./StructureDetail";
import * as api from "@/lib/apiClient";
import { PubChemPreferencesContext } from "@/context/PubChemPreferencesContext";

describe("StructureDetail component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders DialogTitle containing molecular_formula", () => {
    render(<StructureDetail substance={mockSubstance} />);
    const title = screen.getByTestId("dialog-title");
    expect(title).toHaveTextContent("C6H6");
  });

  it("renders an img with a Blob URL src", () => {
    render(<StructureDetail substance={mockSubstance} />);
    const img = document.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toMatch(/^blob:/);
  });

  it("renders SMILES label and value text", () => {
    render(<StructureDetail substance={mockSubstance} />);
    expect(screen.getByText("SMILES")).toBeInTheDocument();
    expect(screen.getByText("c1ccccc1")).toBeInTheDocument();
  });

  it("renders InChI label and value text", () => {
    render(<StructureDetail substance={mockSubstance} />);
    expect(screen.getByText("InChI")).toBeInTheDocument();
    expect(screen.getByText("InChI=1S/C6H6/c1-2-4-6-5-3-1/h1-6H")).toBeInTheDocument();
  });

  it("renders InChI Key label and value text", () => {
    render(<StructureDetail substance={mockSubstance} />);
    expect(screen.getByText("InChI Key")).toBeInTheDocument();
    expect(screen.getByText("UHOVQNZJYSORNB-UHFFFAOYSA-N")).toBeInTheDocument();
  });

  it("renders Molecular Formula label and value text", () => {
    render(<StructureDetail substance={mockSubstance} />);
    expect(screen.getAllByText("Molecular Formula").length).toBeGreaterThan(0);
    // The formula is rendered with <sub> subscripts, so the text is split
    // across elements — match on combined textContent.
    expect(screen.getAllByText((_, el) => el?.textContent === "C6H6").length).toBeGreaterThan(0);
  });

  it("does NOT render MDL V3000 row when mdlv3000 is empty string", () => {
    render(<StructureDetail substance={mockSubstanceNoMdl} />);
    expect(screen.queryByText("MDL V3000")).not.toBeInTheDocument();
  });

  it("renders MDL V3000 row when mdlv3000 is non-empty", () => {
    render(<StructureDetail substance={mockSubstance} />);
    expect(screen.getByText("MDL V3000")).toBeInTheDocument();
    // Use regex to handle browser text normalization (multiple spaces collapsed)
    expect(screen.getByText(/M\s+V30 BEGIN CTAB/)).toBeInTheDocument();
  });

  it("each metadata row has a copy button with correct aria-label", () => {
    render(<StructureDetail substance={mockSubstance} />);
    expect(screen.getByRole("button", { name: "Copy SMILES to clipboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy InChI to clipboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy InChI Key to clipboard" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy Molecular Formula to clipboard" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy MDL V3000 to clipboard" })).toBeInTheDocument();
  });
});

describe("StructureDetail PubChem panel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and renders PubChem detail when opted in", async () => {
    vi.spyOn(api, "getPubChemCompound").mockResolvedValue({
      inchi_key: mockSubstance.inchi_key,
      status: "exact",
      cid: 241,
      iupac_name: "benzene",
      molecular_formula: "C6H6",
      molecular_weight: 78.11,
      canonical_smiles: "C1=CC=CC=C1",
      isomeric_smiles: "C1=CC=CC=C1",
      xlogp: 2.1,
      pubchem_url: "https://pubchem.ncbi.nlm.nih.gov/compound/241",
      connectivity_cid_count: 0,
      title: "Benzene",
      synonyms: ["benzene"],
      description: "An aromatic hydrocarbon.",
      description_source: "NCIt",
    });
    render(
      <PubChemPreferencesContext.Provider
        value={{ enabled: true, setEnabled: () => null, available: true }}
      >
        <StructureDetail substance={mockSubstance} />
      </PubChemPreferencesContext.Provider>,
    );
    expect(await screen.findByText("Benzene")).toBeInTheDocument();
  });

  it("does not fetch when opted out", () => {
    const spy = vi.spyOn(api, "getPubChemCompound");
    render(
      <PubChemPreferencesContext.Provider
        value={{ enabled: false, setEnabled: () => null, available: true }}
      >
        <StructureDetail substance={mockSubstance} />
      </PubChemPreferencesContext.Provider>,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
