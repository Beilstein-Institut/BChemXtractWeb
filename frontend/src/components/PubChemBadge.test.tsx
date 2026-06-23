import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PubChemBadge } from "@/components/PubChemBadge";
import type { PubChemEnrichment } from "@/types/chemistry";

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
  it("renders nothing when idle", () => {
    const { container } = render(<PubChemBadge state={{ state: "idle", data: null }} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders an external link for an exact match", () => {
    render(<PubChemBadge state={{ state: "success", data: enrichment({ status: "exact" }) }} />);
    const link = screen.getByRole("link", { name: /pubchem/i });
    expect(link).toHaveAttribute("href", "https://pubchem.ncbi.nlm.nih.gov/compound/241");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText(/in pubchem/i)).toBeInTheDocument();
  });

  it("labels a scaffold match distinctly", () => {
    render(<PubChemBadge state={{ state: "success", data: enrichment({ status: "scaffold" }) }} />);
    expect(screen.getByText(/known scaffold/i)).toBeInTheDocument();
  });

  it("shows a muted not-found badge for absent", () => {
    render(
      <PubChemBadge
        state={{
          state: "success",
          data: enrichment({ status: "absent", cid: null, pubchem_url: null }),
        }}
      />,
    );
    expect(screen.getByText(/not in pubchem/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
