/**
 * Tests for StructureCard component (Phase 3 Liquid Glass rewrite).
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
    success: vi.fn(),
    loading: vi.fn(),
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
  id: 42,
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

const mockSubstanceNoName: SubstanceResponse = {
  ...mockSubstance,
  iupac_name: "",
};

import { StructureCard } from "./StructureCard";

describe("StructureCard component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("renders IUPAC name in the Inter-semibold name slot", () => {
    render(<StructureCard substance={mockSubstance} />);
    const names = document.querySelectorAll("[data-slot='structure-card-name']");
    expect(names.length).toBeGreaterThan(0);
    expect(names[0].textContent).toBe("benzene");
    expect(names[0].className).toMatch(/font-semibold/);
  });

  it("falls back to molecular formula as the name when iupac_name is empty", () => {
    render(<StructureCard substance={mockSubstanceNoName} />);
    const name = document.querySelector("[data-slot='structure-card-name']");
    expect(name).not.toBeNull();
    expect(name!.textContent).toBe("C6H6");
  });

  it("renders molecular formula with <sub> elements for digit runs", () => {
    render(<StructureCard substance={mockSubstance} />);
    const formula = document.querySelector(
      "[data-slot='structure-card-formula']"
    );
    expect(formula).not.toBeNull();
    // "C6H6" → "C", <sub>6</sub>, "H", <sub>6</sub>
    const subs = formula!.querySelectorAll("sub");
    expect(subs.length).toBe(2);
    expect(Array.from(subs).map((s) => s.textContent)).toEqual(["6", "6"]);
    // Combined text still reads "C6H6"
    expect(formula!.textContent).toBe("C6H6");
  });

  it("renders em-dash in the formula slot when molecular_formula is empty", () => {
    render(
      <StructureCard
        substance={{ ...mockSubstance, molecular_formula: "" }}
      />
    );
    const formula = document.querySelector(
      "[data-slot='structure-card-formula']"
    );
    expect(formula!.textContent).toBe("\u2014");
  });

  it("renders SMILES in the Geist Mono truncated slot with title attr", () => {
    render(<StructureCard substance={mockSubstance} />);
    const smilesEls = document.querySelectorAll(
      "[data-slot='structure-card-smiles']"
    );
    expect(smilesEls.length).toBeGreaterThan(0);
    const smilesEl = smilesEls[0] as HTMLElement;
    expect(smilesEl.textContent).toBe("c1ccccc1");
    expect(smilesEl.className).toMatch(/truncate/);
    expect(smilesEl.className).toMatch(/font-mono/);
    expect(smilesEl.getAttribute("title")).toBe("c1ccccc1");
  });

  it("applies data-slot='structure-card' on the root with hover ring classes", () => {
    render(<StructureCard substance={mockSubstance} />);
    const roots = document.querySelectorAll("[data-slot='structure-card']");
    expect(roots.length).toBeGreaterThan(0);
    const root = roots[0] as HTMLElement;
    expect(root.className).toMatch(/hover:ring-2/);
    expect(root.className).toMatch(/hover:ring-primary\/20/);
    expect(root.className).toMatch(/\bgroup\b/);
  });

  it("renders the white sub-surface with min-h-[160px] and bg-white", () => {
    render(<StructureCard substance={mockSubstance} />);
    const imageSurfaces = document.querySelectorAll(
      "[data-slot='structure-card-image']"
    );
    expect(imageSurfaces.length).toBeGreaterThan(0);
    const surface = imageSurfaces[0] as HTMLElement;
    expect(surface.className).toMatch(/bg-white/);
    expect(surface.className).toMatch(/min-h-\[160px\]/);
  });

  it("PNG image has group-hover scale class", () => {
    render(<StructureCard substance={mockSubstance} />);
    const img = document.querySelector(
      "[data-slot='structure-card-image'] img"
    ) as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.className).toMatch(/group-hover:scale-\[1\.02\]/);
  });

  it("renders FlaskConical fallback (no img element) when svg prop is empty string", () => {
    render(<StructureCard substance={mockSubstanceNoSvg} />);
    const img = document.querySelector("[data-slot='structure-card-image'] img");
    expect(img).toBeNull();
  });

  it("renders an img with a Blob URL src when svg is present", () => {
    render(<StructureCard substance={mockSubstance} />);
    const img = document.querySelector(
      "[data-slot='structure-card-image'] img"
    ) as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.src).toMatch(/^blob:/);
  });

  it('renders a button with aria-label="Copy SMILES to clipboard"', () => {
    render(<StructureCard substance={mockSubstance} />);
    // There may be multiple (card + dialog both render copy buttons); at least one must exist
    const copyBtns = screen.getAllByRole("button", { name: "Copy SMILES to clipboard" });
    expect(copyBtns.length).toBeGreaterThan(0);
  });

  it("clicking the copy button calls navigator.clipboard.writeText with smiles value", async () => {
    render(<StructureCard substance={mockSubstance} />);
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

  it("renders a share button with data-slot='structure-card-share'", () => {
    render(<StructureCard substance={mockSubstance} />);
    const shareBtns = document.querySelectorAll(
      "[data-slot='structure-card-share']"
    );
    expect(shareBtns.length).toBeGreaterThan(0);
    expect(shareBtns[0].getAttribute("aria-label")).toBe("Copy share link");
  });

  it("clicking share copies a URL containing the InChI key to the clipboard", async () => {
    render(<StructureCard substance={mockSubstance} />);
    const shareBtn = document.querySelector(
      "[data-slot='structure-card-share']"
    ) as HTMLElement;
    fireEvent.click(shareBtn);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });
    const call = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(call).toContain(`#s=${encodeURIComponent(mockSubstance.inchi_key)}`);
    expect(call).toContain("/browse");
  });

  it("after share, the share button flips to 'Share link copied' aria-label", async () => {
    render(<StructureCard substance={mockSubstance} />);
    const shareBtn = document.querySelector(
      "[data-slot='structure-card-share']"
    ) as HTMLElement;
    fireEvent.click(shareBtn);
    await waitFor(() => {
      const after = document.querySelector(
        "[data-slot='structure-card-share']"
      ) as HTMLElement;
      expect(after.getAttribute("aria-label")).toBe("Share link copied");
    });
  });

  it("shows a toast.error when the share clipboard write fails (I-3 regression)", async () => {
    // Regression guard for Task 14 review item I-3: useShareLink used to
    // swallow clipboard rejections, making the handler's catch branch dead
    // code. The hook now rejects, so StructureCard must surface the error
    // via sonner's toast.error.
    const { toast } = await import("sonner");
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("denied")
    );
    render(<StructureCard substance={mockSubstance} />);
    const shareBtn = document.querySelector(
      "[data-slot='structure-card-share']"
    ) as HTMLElement;
    fireEvent.click(shareBtn);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not copy share link.");
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
    const cardTrigger = screen.getByRole("button", { name: /View details for C6H6/ });
    const copyBtns = within(cardTrigger).getAllByRole("button", { name: "Copy SMILES to clipboard" });
    fireEvent.click(copyBtns[0]);
    expect(handleParentClick).not.toHaveBeenCalled();
  });

  it("clicking the share button does NOT bubble to the parent div (stopPropagation)", () => {
    const handleParentClick = vi.fn();
    render(
      <div onClick={handleParentClick} data-testid="parent-wrapper">
        <StructureCard substance={mockSubstance} />
      </div>
    );
    const shareBtn = document.querySelector(
      "[data-slot='structure-card-share']"
    ) as HTMLElement;
    fireEvent.click(shareBtn);
    expect(handleParentClick).not.toHaveBeenCalled();
  });
});
