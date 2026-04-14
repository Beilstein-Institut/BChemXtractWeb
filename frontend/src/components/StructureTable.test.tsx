/**
 * Tests for StructureTable component.
 * Vitest globals: true — no need to import describe/it/expect.
 *
 * Mocks base-ui primitives to avoid portal/animation complexity in jsdom.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, beforeEach } from "vitest";
import type { SubstanceResponse } from "@/types/chemistry";

// Mock navigator.clipboard
Object.defineProperty(navigator, "clipboard", {
  writable: true,
  value: { writeText: vi.fn() },
});

// Mock sonner
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

// Mock @base-ui/react/checkbox
vi.mock("@base-ui/react/checkbox", () => {
  const React = require("react");
  return {
    Checkbox: {
      Root: ({ children, checked, onCheckedChange, "aria-label": ariaLabel, className, ...rest }: {
        children?: React.ReactNode;
        checked?: boolean;
        onCheckedChange?: (checked: boolean) => void;
        "aria-label"?: string;
        className?: string;
        [key: string]: unknown;
      }) =>
        React.createElement("input", {
          type: "checkbox",
          checked: checked ?? false,
          onChange: () => onCheckedChange && onCheckedChange(!checked),
          "aria-label": ariaLabel,
          className,
          ...rest,
        }),
      Indicator: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    },
  };
});

// Mock @base-ui/react/tooltip
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

// Mock @base-ui/react/button
vi.mock("@base-ui/react/button", () => {
  const React = require("react");
  return {
    Button: React.forwardRef(
      ({ children, className, ...props }: React.ComponentProps<"button">, ref: React.Ref<HTMLButtonElement>) =>
        React.createElement("button", { ref, className, ...props }, children)
    ),
  };
});

function makeSubstance(id: number, overrides?: Partial<SubstanceResponse>): SubstanceResponse {
  return {
    id,
    inchi: `InChI=1S/test${id}`,
    inchi_key: `TESTINCHIKEY${String(id).padStart(3, "0")}-UHFFFAOYSA-N`,
    smiles: `C${id}`,
    extended_smiles: `C${id}`,
    iupac_name: `compound${id}`,
    molecular_formula: `C${id}H${id * 2}`,
    aux_info: "",
    mdlv3000: "",
    abbreviations: {},
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="450"><circle cx="225" cy="225" r="${id * 10}"/></svg>`,
    ...overrides,
  };
}

const noop = () => {};
const noopAsync = async () => {};

import { StructureTable } from "./StructureTable";

describe("StructureTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("renders correct number of rows for provided substances", () => {
    const substances = [makeSubstance(1), makeSubstance(2), makeSubstance(3)];
    render(
      <StructureTable
        substances={substances}
        selectedIds={new Set()}
        onToggleSelect={noop}
        onSelectAll={noop}
        allSelected={false}
        onOpen={noop}
      />
    );

    // 3 molecular formula cells should exist (one per substance row)
    const formulaCells = screen.getAllByText(/C[0-9]+H[0-9]+/);
    expect(formulaCells.length).toBe(3);
  });

  it("renders an empty table body when substances is empty", () => {
    const { container } = render(
      <StructureTable
        substances={[]}
        selectedIds={new Set()}
        onToggleSelect={noop}
        onSelectAll={noop}
        allSelected={false}
        onOpen={noop}
      />
    );
    // tbody should have no data rows (only header)
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(0);
  });

  it("renders skeleton rows when loading=true", () => {
    const { container } = render(
      <StructureTable
        substances={[]}
        selectedIds={new Set()}
        onToggleSelect={noop}
        onSelectAll={noop}
        allSelected={false}
        onOpen={noop}
        loading={true}
      />
    );
    const skeletonRows = container.querySelectorAll("tbody tr");
    expect(skeletonRows.length).toBe(12);
  });

  it("clicking a row checkbox calls onToggleSelect with substance id", () => {
    const onToggleSelect = vi.fn();
    const substances = [makeSubstance(1), makeSubstance(2)];

    render(
      <StructureTable
        substances={substances}
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
        onSelectAll={noop}
        allSelected={false}
        onOpen={noop}
      />
    );

    // Find checkboxes for row selection (aria-label "Select C1H2")
    const rowCheckbox = screen.getByLabelText("Select C1H2");
    fireEvent.click(rowCheckbox);
    expect(onToggleSelect).toHaveBeenCalledWith(1);
  });

  it("clicking the 'Select all on page' header checkbox calls onSelectAll", () => {
    const onSelectAll = vi.fn();
    const substances = [makeSubstance(1)];

    render(
      <StructureTable
        substances={substances}
        selectedIds={new Set()}
        onToggleSelect={noop}
        onSelectAll={onSelectAll}
        allSelected={false}
        onOpen={noop}
      />
    );

    const headerCheckbox = screen.getByLabelText("Select all on page");
    fireEvent.click(headerCheckbox);
    expect(onSelectAll).toHaveBeenCalled();
  });

  it("clicking a row body (not checkbox) calls onOpen with correct index", () => {
    const onOpen = vi.fn();
    const substances = [makeSubstance(1), makeSubstance(2)];

    const { container } = render(
      <StructureTable
        substances={substances}
        selectedIds={new Set()}
        onToggleSelect={noop}
        onSelectAll={noop}
        allSelected={false}
        onOpen={onOpen}
      />
    );

    // Click second row (tbody tr:nth-child(2))
    const rows = container.querySelectorAll("tbody tr");
    fireEvent.click(rows[1]);
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("renders SVG as data URI (T-04-04, T-06-06 mitigation)", () => {
    const substances = [makeSubstance(1)];

    const { container } = render(
      <StructureTable
        substances={substances}
        selectedIds={new Set()}
        onToggleSelect={noop}
        onSelectAll={noop}
        allSelected={false}
        onOpen={noop}
      />
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it("renders FlaskConicalIcon fallback when svg is empty string", () => {
    const substances = [makeSubstance(1, { svg: "" })];

    const { container } = render(
      <StructureTable
        substances={substances}
        selectedIds={new Set()}
        onToggleSelect={noop}
        onSelectAll={noop}
        allSelected={false}
        onOpen={noop}
      />
    );

    const img = container.querySelector("img");
    expect(img).toBeNull();
  });

  it("applies bg-primary/5 to selected rows", () => {
    const substances = [makeSubstance(1), makeSubstance(2)];

    const { container } = render(
      <StructureTable
        substances={substances}
        selectedIds={new Set([1])}
        onToggleSelect={noop}
        onSelectAll={noop}
        allSelected={false}
        onOpen={noop}
      />
    );

    const rows = container.querySelectorAll("tbody tr");
    expect(rows[0].className).toMatch(/bg-primary\/5/);
    expect(rows[1].className).not.toMatch(/bg-primary\/5/);
  });

  it("InChI key column has hidden md:table-cell class", () => {
    const substances = [makeSubstance(1)];

    const { container } = render(
      <StructureTable
        substances={substances}
        selectedIds={new Set()}
        onToggleSelect={noop}
        onSelectAll={noop}
        allSelected={false}
        onOpen={noop}
      />
    );

    // Find cells with hidden md:table-cell
    const hiddenCells = container.querySelectorAll(".hidden.md\\:table-cell");
    expect(hiddenCells.length).toBeGreaterThan(0);
  });

  it("copy button calls navigator.clipboard.writeText with SMILES", async () => {
    const substances = [makeSubstance(1)];

    render(
      <StructureTable
        substances={substances}
        selectedIds={new Set()}
        onToggleSelect={noop}
        onSelectAll={noop}
        allSelected={false}
        onOpen={noop}
      />
    );

    const copyBtn = screen.getByLabelText("Copy SMILES to clipboard");
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("C1");
  });
});
