import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PubChemBadge } from "@/components/PubChemBadge";
import type { PubChemEnrichment } from "@/types/chemistry";

// toast is callable (toast("msg")) with helper methods; the absent control
// uses the callable form when launching the similarity search.
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), loading: vi.fn() }),
}));

function enrichment(over: Partial<PubChemEnrichment>): PubChemEnrichment {
  return {
    inchi_key: "X",
    status: "exact",
    cid: 241,
    iupac_name: null,
    molecular_formula: null,
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
    ...over,
  };
}

describe("PubChemBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "open").mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when idle", () => {
    const { container } = render(<PubChemBadge state={{ state: "idle", data: null }} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the lookup errored (enrichment stays additive)", () => {
    const { container } = render(<PubChemBadge state={{ state: "error", data: null }} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when success carries no data", () => {
    const { container } = render(<PubChemBadge state={{ state: "success", data: null }} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a skeleton while loading", () => {
    const { container } = render(<PubChemBadge state={{ state: "loading", data: null }} />);
    expect(container.querySelector("[data-slot='pubchem-badge-skeleton']")).not.toBeNull();
  });

  it("renders the PubChem wordmark alongside the status", () => {
    const { container } = render(
      <PubChemBadge state={{ state: "success", data: enrichment({ status: "exact" }) }} />,
    );
    // Pin the wordmark specifically via its data-slot — not just "some
    // aria-hidden svg", which the sibling ExternalLinkIcon would also satisfy.
    const wordmark = container.querySelector("[data-slot='pubchem-wordmark']");
    expect(wordmark).not.toBeNull();
    expect(wordmark!.tagName.toLowerCase()).toBe("svg");
    expect(wordmark!.getAttribute("aria-hidden")).toBe("true");
  });

  it("opens the PubChem page directly for an exact match", () => {
    render(<PubChemBadge state={{ state: "success", data: enrichment({ status: "exact" }) }} />);
    const link = screen.getByRole("link", { name: /in pubchem — open on pubchem/i });
    expect(link).toHaveAttribute("href", "https://pubchem.ncbi.nlm.nih.gov/compound/241");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText(/in pubchem/i)).toBeInTheDocument();
  });

  it("opens the PubChem page directly for a scaffold match (labelled distinctly)", () => {
    render(<PubChemBadge state={{ state: "success", data: enrichment({ status: "scaffold" }) }} />);
    expect(screen.getByRole("link", { name: /known scaffold — open on pubchem/i })).toHaveAttribute(
      "href",
      "https://pubchem.ncbi.nlm.nih.gov/compound/241",
    );
    expect(screen.getByText(/known scaffold/i)).toBeInTheDocument();
  });

  it("offers a 2D-similarity search for an absent match", () => {
    render(
      <PubChemBadge
        state={{
          state: "success",
          data: enrichment({ status: "absent", cid: null, pubchem_url: null }),
        }}
        smiles="c1ccccc1"
      />,
    );
    // Not a link — an action that searches for similar molecules.
    expect(screen.queryByRole("link")).toBeNull();
    const btn = screen.getByRole("button", { name: /search for similar molecules/i });
    fireEvent.click(btn);
    expect(window.open).toHaveBeenCalledWith(
      "https://pubchem.ncbi.nlm.nih.gov/#query=c1ccccc1&input_type=smiles&tab=similarity",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("toasts before launching the similarity search", async () => {
    const { toast } = await import("sonner");
    render(
      <PubChemBadge
        state={{
          state: "success",
          data: enrichment({ status: "absent", cid: null, pubchem_url: null }),
        }}
        smiles="c1ccccc1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /search for similar molecules/i }));
    expect(toast).toHaveBeenCalledWith("Not on PubChem — searching for similar molecules");
  });

  it("falls back to a static badge for absent when no SMILES is available", () => {
    render(
      <PubChemBadge
        state={{
          state: "success",
          data: enrichment({ status: "absent", cid: null, pubchem_url: null }),
        }}
      />,
    );
    expect(screen.getByText(/not in pubchem/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
