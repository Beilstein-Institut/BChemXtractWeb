/**
 * Tests for StructureSheet component.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * StructureSheet renders a side-panel Sheet with prev/next navigation,
 * position indicator, keyboard shortcuts, and substance metadata.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, beforeEach } from "vitest";
import * as React from "react";
import * as api from "@/lib/apiClient";
import { PubChemPreferencesContext } from "@/context/PubChemPreferencesContext";
import type { SubstanceResponse } from "@/types/chemistry";

// Mock @base-ui/react/dialog to avoid portal/animation complexity in jsdom.
vi.mock("@base-ui/react/dialog", () => {
  return {
    Dialog: {
      Root: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
        open
          ? React.createElement(React.Fragment, null, children)
          : React.createElement(React.Fragment, null),
      Trigger: ({
        children,
        render: renderProp,
        ...rest
      }: {
        children?: React.ReactNode;
        render?: React.ReactElement;
        [key: string]: unknown;
      }) => {
        if (renderProp) {
          return React.cloneElement(renderProp, rest, children);
        }
        return React.createElement(React.Fragment, null, children);
      },
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Backdrop: ({ className }: { className?: string }) =>
        React.createElement("div", {
          "data-testid": "dialog-backdrop",
          className,
        }),
      Popup: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement(
          "div",
          { "data-testid": "dialog-popup", role: "dialog", className },
          children,
        ),
      Close: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("button", { "data-testid": "dialog-close" }, children ?? null),
      Title: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("h2", { "data-testid": "dialog-title", className }, children),
      Description: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("p", { "data-testid": "dialog-description", className }, children),
    },
  };
});

// Mock @base-ui/react/button to a simple <button> in tests
vi.mock("@base-ui/react/button", () => {
  return {
    Button: React.forwardRef(
      (
        { children, className, ...props }: React.ComponentProps<"button">,
        ref: React.Ref<HTMLButtonElement>,
      ) => React.createElement("button", { ref, className, ...props }, children),
    ),
  };
});

// Mock @base-ui/react/tooltip to avoid portal/positioning complexity in jsdom.
vi.mock("@base-ui/react/tooltip", () => {
  return {
    Tooltip: {
      Provider: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Root: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Trigger: ({
        children,
        render: renderProp,
        ...rest
      }: {
        children?: React.ReactNode;
        render?: React.ReactElement;
        [key: string]: unknown;
      }) => {
        if (renderProp) {
          // Preserve the render element's own children when TooltipTrigger
          // has no children of its own (e.g. self-closing usage).
          return children === undefined
            ? React.cloneElement(renderProp, rest)
            : React.cloneElement(renderProp, rest, children);
        }
        return React.createElement(React.Fragment, null, children);
      },
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Positioner: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Popup: ({ children }: { children: React.ReactNode }) =>
        React.createElement("div", { "data-testid": "tooltip-content" }, children),
      Arrow: () => null,
    },
  };
});

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock navigator.clipboard
Object.defineProperty(navigator, "clipboard", {
  writable: true,
  value: {
    writeText: vi.fn(),
  },
});

const mockSubstance: SubstanceResponse = {
  id: 1,
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

import { StructureSheet } from "./StructureSheet";

describe("StructureSheet component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "3 of 10" position indicator when substanceIndex=2, totalSubstances=10', () => {
    render(
      <StructureSheet
        open={true}
        onOpenChange={vi.fn()}
        substance={mockSubstance}
        substanceIndex={2}
        totalSubstances={10}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText("3 of 10")).toBeInTheDocument();
  });

  it("Prev button is disabled when substanceIndex=0", () => {
    render(
      <StructureSheet
        open={true}
        onOpenChange={vi.fn()}
        substance={mockSubstance}
        substanceIndex={0}
        totalSubstances={10}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const prevBtn = screen.getByRole("button", { name: "Previous structure" });
    expect(prevBtn).toBeDisabled();
  });

  it("Next button is disabled when substanceIndex === totalSubstances - 1", () => {
    render(
      <StructureSheet
        open={true}
        onOpenChange={vi.fn()}
        substance={mockSubstance}
        substanceIndex={9}
        totalSubstances={10}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const nextBtn = screen.getByRole("button", { name: "Next structure" });
    expect(nextBtn).toBeDisabled();
  });

  it("onPrev is called when prev button is clicked", () => {
    const onPrev = vi.fn();
    render(
      <StructureSheet
        open={true}
        onOpenChange={vi.fn()}
        substance={mockSubstance}
        substanceIndex={5}
        totalSubstances={10}
        onPrev={onPrev}
        onNext={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Previous structure" }));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("onNext is called when next button is clicked", () => {
    const onNext = vi.fn();
    render(
      <StructureSheet
        open={true}
        onOpenChange={vi.fn()}
        substance={mockSubstance}
        substanceIndex={5}
        totalSubstances={10}
        onPrev={vi.fn()}
        onNext={onNext}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next structure" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("renders SVG via a Blob URL in an img element", () => {
    render(
      <StructureSheet
        open={true}
        onOpenChange={vi.fn()}
        substance={mockSubstance}
        substanceIndex={0}
        totalSubstances={1}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs[0].src).toMatch(/^blob:/);
  });

  it("does not render content when open is false", () => {
    render(
      <StructureSheet
        open={false}
        onOpenChange={vi.fn()}
        substance={mockSubstance}
        substanceIndex={0}
        totalSubstances={10}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.queryByText("1 of 10")).not.toBeInTheDocument();
  });

  it("shows both CDK and ChemDraw buttons even when svg_cdx is empty", () => {
    render(
      <StructureSheet
        open={true}
        onOpenChange={vi.fn()}
        substance={{ ...mockSubstance, svg: "<svg>cdk</svg>", svg_cdx: "" }}
        substanceIndex={0}
        totalSubstances={1}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^CDK$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^ChemDraw$/i })).toBeInTheDocument();
  });

  it("disables the ChemDraw button when svg_cdx is empty", () => {
    render(
      <StructureSheet
        open={true}
        onOpenChange={vi.fn()}
        substance={{ ...mockSubstance, svg: "<svg>cdk</svg>", svg_cdx: "" }}
        substanceIndex={0}
        totalSubstances={1}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^ChemDraw$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^CDK$/i })).toBeEnabled();
  });

  it("disables the CDK button when svg is empty", () => {
    render(
      <StructureSheet
        open={true}
        onOpenChange={vi.fn()}
        substance={{ ...mockSubstance, svg: "", svg_cdx: "<svg>cdx</svg>" }}
        substanceIndex={0}
        totalSubstances={1}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^CDK$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^ChemDraw$/i })).toBeEnabled();
  });

  it("auto-selects ChemDraw when svg (CDK) is empty so the image area is not blank", () => {
    render(
      <StructureSheet
        open={true}
        onOpenChange={vi.fn()}
        substance={{ ...mockSubstance, svg: "", svg_cdx: "<svg>cdx</svg>" }}
        substanceIndex={0}
        totalSubstances={1}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const img = document.querySelector("img[alt*='structure']") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toMatch(/^blob:/);
  });

  it("defaults to the CDK layout when both renders are stored", () => {
    // Product default: depiction prop omitted -> CDK ("cdk").
    render(
      <StructureSheet
        open={true}
        onOpenChange={vi.fn()}
        substance={{ ...mockSubstance, svg_cdx: "<svg>cdx</svg>" }}
        substanceIndex={0}
        totalSubstances={1}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^CDK$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^ChemDraw$/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("initializes from the page-level depiction prop (cdk)", () => {
    render(
      <StructureSheet
        open={true}
        onOpenChange={vi.fn()}
        substance={{ ...mockSubstance, svg_cdx: "<svg>cdx</svg>" }}
        substanceIndex={0}
        totalSubstances={1}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        depiction="cdk"
      />,
    );
    expect(screen.getByRole("button", { name: /^CDK$/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("falls back to CDK when cdx is preferred but svg_cdx is missing", () => {
    render(
      <StructureSheet
        open={true}
        onOpenChange={vi.fn()}
        substance={{ ...mockSubstance, svg_cdx: "" }}
        substanceIndex={0}
        totalSubstances={1}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        depiction="cdx"
      />,
    );
    // ChemDraw layout not stored -> the sheet shows the CDK render.
    expect(screen.getByRole("button", { name: /^CDK$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^ChemDraw$/i })).toBeDisabled();
  });
});

describe("StructureSheet PubChem panel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and renders the PubChem panel when opted in", async () => {
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
        <StructureSheet
          open={true}
          onOpenChange={vi.fn()}
          substance={mockSubstance}
          substanceIndex={0}
          totalSubstances={1}
          onPrev={vi.fn()}
          onNext={vi.fn()}
        />
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
        <StructureSheet
          open={true}
          onOpenChange={vi.fn()}
          substance={mockSubstance}
          substanceIndex={0}
          totalSubstances={1}
          onPrev={vi.fn()}
          onNext={vi.fn()}
        />
      </PubChemPreferencesContext.Provider>,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("StructureSheet on-demand InChI", () => {
  // A substance whose InChI was skipped at extraction: empty inchi + a
  // surrogate "S…" InChIKey. SMILES is present.
  const noInchiSubstance: SubstanceResponse = {
    ...mockSubstance,
    inchi: "",
    inchi_key: "SABCDEF12345678-ABCDEFGHIJ-N",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderSheet(substance: SubstanceResponse) {
    render(
      <StructureSheet
        open={true}
        onOpenChange={vi.fn()}
        substance={substance}
        substanceIndex={0}
        totalSubstances={1}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
  }

  it("hides the surrogate InChI Key and shows a Generate InChI button", () => {
    renderSheet(noInchiSubstance);
    // The misleading surrogate key must not be shown.
    expect(screen.queryByText("SABCDEF12345678-ABCDEFGHIJ-N")).toBeNull();
    expect(screen.queryByText("InChI Key")).toBeNull();
    expect(screen.getByRole("button", { name: /Generate InChI/i })).toBeInTheDocument();
  });

  it("shows a real InChI + Key (no button) when InChI is present", () => {
    renderSheet(mockSubstance);
    expect(screen.getByText("UHOVQNZJYSORNB-UHFFFAOYSA-N")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate InChI/i })).toBeNull();
  });

  it("computes and displays InChI + Key when the button is clicked", async () => {
    const spy = vi.spyOn(api, "postComputeInchi").mockResolvedValue({
      inchi: "InChI=1S/C6H6/c1-2-4-6-5-3-1/h1-6H",
      inchi_key: "UHOVQNZJYSORNB-UHFFFAOYSA-N",
    });
    renderSheet(noInchiSubstance);

    fireEvent.click(screen.getByRole("button", { name: /Generate InChI/i }));

    expect(spy).toHaveBeenCalledWith("c1ccccc1");
    expect(await screen.findByText("UHOVQNZJYSORNB-UHFFFAOYSA-N")).toBeInTheDocument();
    expect(screen.getByText("InChI=1S/C6H6/c1-2-4-6-5-3-1/h1-6H")).toBeInTheDocument();
  });
});
