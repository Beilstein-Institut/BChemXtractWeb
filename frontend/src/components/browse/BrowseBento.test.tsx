/**
 * BrowseBento — bento-landing tile tests (Phase 3 Task 11).
 *
 * Verifies the 5 cells render with the expected data-slot hooks
 * (the former "Featured structures" strip was removed — it carried
 * no signal and duplicated the full browser below), the "Browse all"
 * CTA invokes its callback, and empty-state copy appears when the
 * filtered slice is empty.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import type { SubstanceResponse } from "@/types/chemistry";

import { BrowseBento } from "./BrowseBento";

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

function makeList(n: number): SubstanceResponse[] {
  return Array.from({ length: n }, (_, i) =>
    makeSubstance({
      id: i + 1,
      inchi_key: `KEY-${i + 1}`,
      molecular_formula: `C${i + 1}H${2 * i}`,
    }),
  );
}

describe("BrowseBento", () => {
  it("renders all 5 bento cells with data-slot hooks", () => {
    const substances = makeList(10);
    const { container } = render(
      <BrowseBento
        substances={substances}
        totalSubstances={substances.length}
        format="cdxml"
        onBrowseAll={vi.fn()}
        onOpenSubstance={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-slot="browse-bento"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="browse-bento-cell-recent"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="browse-bento-cell-total"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="browse-bento-cell-unique"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="browse-bento-cell-cta"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="browse-bento-cell-format"]')).not.toBeNull();
    // The "Featured structures" strip was removed — must not render.
    expect(container.querySelector('[data-slot="browse-bento-cell-popular"]')).toBeNull();
  });

  it("shows the filtered count and total count", () => {
    const substances = makeList(4);
    render(
      <BrowseBento
        substances={substances}
        totalSubstances={10}
        format="cdx"
        onBrowseAll={vi.fn()}
      />,
    );
    expect(screen.getByText(/structures in view/i)).toBeInTheDocument();
    // "Filtered from 10 total." caption.
    expect(screen.getByText(/filtered from 10 total/i)).toBeInTheDocument();
  });

  it("counts unique InChI keys in the current slice", () => {
    const list: SubstanceResponse[] = [
      makeSubstance({ id: 1, inchi_key: "A" }),
      makeSubstance({ id: 2, inchi_key: "A" }), // duplicate
      makeSubstance({ id: 3, inchi_key: "B" }),
    ];
    render(
      <BrowseBento
        substances={list}
        totalSubstances={list.length}
        format="cdxml"
        onBrowseAll={vi.fn()}
      />,
    );
    expect(screen.getByText(/unique inchi keys/i)).toBeInTheDocument();
    // The unique stat shows `2` for the A+A+B set; assert it via the
    // stat tile's formatted value.
    const uniqueTile = screen
      .getByText(/unique inchi keys/i)
      .closest('[data-slot="browse-bento-stat"]');
    expect(uniqueTile?.textContent).toContain("2");
  });

  it("invokes onBrowseAll when the CTA button is clicked", () => {
    const onBrowseAll = vi.fn();
    render(
      <BrowseBento
        substances={makeList(3)}
        totalSubstances={3}
        format="cdx"
        onBrowseAll={onBrowseAll}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /view all/i }));
    expect(onBrowseAll).toHaveBeenCalledTimes(1);
  });

  it("renders empty-state copy inside the preview tile when no matches", () => {
    render(
      <BrowseBento substances={[]} totalSubstances={5} format="cdxml" onBrowseAll={vi.fn()} />,
    );
    expect(
      screen.getByText(/adjust your search or filters to see structures/i),
    ).toBeInTheDocument();
  });

  it("calls onOpenSubstance with the absolute index for preview thumbnails", () => {
    const onOpen = vi.fn();
    const list = makeList(3);
    render(
      <BrowseBento
        substances={list}
        totalSubstances={list.length}
        format="cdx"
        onBrowseAll={vi.fn()}
        onOpenSubstance={onOpen}
      />,
    );
    // First thumbnail in Recent maps to index 0.
    const thumbs = screen.getAllByRole("button", { name: /open details for/i });
    fireEvent.click(thumbs[0]);
    expect(onOpen).toHaveBeenCalledWith(0);
  });

  it("trims the preview to 3 thumbnails when more than 5 structures are present", () => {
    render(
      <BrowseBento
        substances={makeList(12)}
        totalSubstances={12}
        format="cdx"
        onBrowseAll={vi.fn()}
        onOpenSubstance={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("button", { name: /open details for/i })).toHaveLength(3);
    expect(screen.getByText(/showing the first 3 of 12 structures/i)).toBeInTheDocument();
  });

  it("shows all structures in the preview when 5 or fewer are present", () => {
    render(
      <BrowseBento
        substances={makeList(5)}
        totalSubstances={5}
        format="cdx"
        onBrowseAll={vi.fn()}
        onOpenSubstance={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("button", { name: /open details for/i })).toHaveLength(5);
    expect(screen.getByText(/showing all 5 structures/i)).toBeInTheDocument();
  });

  it("displays the uppercase source format", () => {
    render(
      <BrowseBento
        substances={makeList(2)}
        totalSubstances={2}
        format="cdxml"
        onBrowseAll={vi.fn()}
      />,
    );
    expect(screen.getByText("CDXML")).toBeInTheDocument();
  });
});
