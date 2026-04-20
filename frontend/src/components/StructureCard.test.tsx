/**
 * Tests for StructureCard component.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * Note: The dialog mock renders both the trigger and content always visible.
 * Because StructureDetail (rendered inside the Dialog) also has metadata
 * buttons, some tests use getAllByRole / within() to scope assertions to the
 * card area specifically.
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { vi, beforeEach } from "vitest";
import type { SubstanceResponse } from "@/types/chemistry";

// Mock navigator.clipboard
Object.defineProperty(navigator, "clipboard", {
  writable: true,
  value: {
    writeText: vi.fn(),
  },
});

// Mock sonner so we can assert toast calls without a real Toaster in DOM
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

// Mock @base-ui/react/dialog to avoid portal/animation complexity in jsdom.
// The mock always renders children (both trigger and content are visible).
vi.mock("@base-ui/react/dialog", () => {
  const React = require("react");
  return {
    Dialog: {
      Root: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Trigger: ({ children, render: renderProp, ...rest }: { children?: React.ReactNode; render?: React.ReactElement; [key: string]: unknown }) => {
        if (renderProp) {
          return React.cloneElement(renderProp, rest, children);
        }
        return React.createElement(React.Fragment, null, children);
      },
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Backdrop: ({ className }: { className?: string }) =>
        React.createElement("div", { "data-testid": "dialog-backdrop", className }),
      Popup: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("div", { "data-testid": "dialog-popup", role: "dialog", className }, children),
      Close: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("button", { "data-testid": "dialog-close" }, children ?? null),
      Title: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("h2", { "data-testid": "dialog-title", className }, children),
      Description: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("p", { "data-testid": "dialog-description", className }, children),
    },
  };
});

// Mock @base-ui/react/tooltip to avoid portal complexity in jsdom
vi.mock("@base-ui/react/tooltip", () => {
  const React = require("react");
  return {
    Tooltip: {
      Provider: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Root: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Trigger: ({ children, render: renderProp, ...rest }: { children?: React.ReactNode; render?: React.ReactElement; [key: string]: unknown }) => {
        if (renderProp) {
          return React.cloneElement(renderProp, rest, children);
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

// Mock @base-ui/react/button to a simple <button> in tests
vi.mock("@base-ui/react/button", () => {
  const React = require("react");
  return {
    Button: React.forwardRef(
      ({ children, className, ...props }: React.ComponentProps<"button">, ref: React.Ref<HTMLButtonElement>) =>
        React.createElement("button", { ref, className, ...props }, children)
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

const mockSubstanceNoSvg: SubstanceResponse = {
  ...mockSubstance,
  svg: "",
};

import { StructureCard } from "./StructureCard";

describe("StructureCard component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("renders molecular formula text", () => {
    render(<StructureCard substance={mockSubstance} />);
    // The formula appears in both the card and the dialog; at least one occurrence
    expect(screen.getAllByText("C6H6").length).toBeGreaterThan(0);
  });

  it("renders SMILES in a span with truncate class", () => {
    render(<StructureCard substance={mockSubstance} />);
    // Find the truncated span specifically (inside the card trigger area, not dialog)
    const truncatedSpans = document.querySelectorAll("span.truncate, span[class*='truncate']");
    expect(truncatedSpans.length).toBeGreaterThan(0);
    const smilesSpan = Array.from(truncatedSpans).find(
      (el) => el.textContent === "c1ccccc1"
    );
    expect(smilesSpan).toBeDefined();
    expect(smilesSpan!.className).toMatch(/truncate/);
  });

  it("renders an img element with a Blob URL src", () => {
    render(<StructureCard substance={mockSubstance} />);
    // At least one img element (the card thumbnail)
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs[0].src).toMatch(/^blob:/);
  });

  it("renders FlaskConical fallback (no img element) when svg prop is empty string", () => {
    render(<StructureCard substance={mockSubstanceNoSvg} />);
    const img = document.querySelector("img");
    expect(img).toBeNull();
  });

  it('renders a button with aria-label="Copy SMILES to clipboard"', () => {
    render(<StructureCard substance={mockSubstance} />);
    // There may be multiple (card + dialog both render copy buttons); at least one must exist
    const copyBtns = screen.getAllByRole("button", { name: "Copy SMILES to clipboard" });
    expect(copyBtns.length).toBeGreaterThan(0);
  });

  it("clicking the copy button calls navigator.clipboard.writeText with smiles value", async () => {
    render(<StructureCard substance={mockSubstance} />);
    // Click the first "Copy SMILES to clipboard" button (the card-level one)
    const copyBtns = screen.getAllByRole("button", { name: "Copy SMILES to clipboard" });
    fireEvent.click(copyBtns[0]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("c1ccccc1");
  });

  it("after successful copy, the copy button shows Copied! aria-label", async () => {
    render(<StructureCard substance={mockSubstance} />);
    const copyBtns = screen.getAllByRole("button", { name: "Copy SMILES to clipboard" });
    fireEvent.click(copyBtns[0]);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Copied!" }).length).toBeGreaterThan(0);
    });
  });

  it('the card div has role="button" and aria-label containing molecular_formula', () => {
    render(<StructureCard substance={mockSubstance} />);
    const cardButton = screen.getByRole("button", { name: /View details for C6H6/ });
    expect(cardButton).toBeInTheDocument();
  });

  it("clicking the copy button does NOT bubble to the parent div (stopPropagation)", () => {
    const handleParentClick = vi.fn();
    render(
      <div onClick={handleParentClick} data-testid="parent-wrapper">
        <StructureCard substance={mockSubstance} />
      </div>
    );
    // Find the card-level copy button (the one inside the card trigger div, not the dialog)
    const cardTrigger = screen.getByRole("button", { name: /View details for C6H6/ });
    // The SMILES copy button is a sibling of the formula text inside the card
    const copyBtns = within(cardTrigger).getAllByRole("button", { name: "Copy SMILES to clipboard" });
    fireEvent.click(copyBtns[0]);
    // The parent div should NOT receive the click since stopPropagation is called
    expect(handleParentClick).not.toHaveBeenCalled();
  });
});
