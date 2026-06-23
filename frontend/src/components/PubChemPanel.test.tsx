import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PubChemPanel } from "@/components/PubChemPanel";
import type { PubChemEnrichment } from "@/types/chemistry";

const base: PubChemEnrichment = {
  inchi_key: "X",
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
  synonyms: ["benzene", "benzol"],
  description: "An aromatic hydrocarbon.",
  description_source: "NCIt",
};

describe("PubChemPanel", () => {
  it("shows a loading skeleton", () => {
    render(<PubChemPanel state={{ state: "loading", data: null }} />);
    expect(screen.getByTestId("pubchem-panel-loading")).toBeInTheDocument();
  });

  it("renders title, CID link, synonyms, and source", () => {
    render(<PubChemPanel state={{ state: "success", data: base }} />);
    expect(screen.getByText("Benzene")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /241/ })).toHaveAttribute(
      "href",
      "https://pubchem.ncbi.nlm.nih.gov/compound/241",
    );
    expect(screen.getByText(/benzol/)).toBeInTheDocument();
    expect(screen.getByText(/NCIt/)).toBeInTheDocument();
  });

  it("renders an absent state without a link", () => {
    render(
      <PubChemPanel
        state={{
          state: "success",
          data: { ...base, status: "absent", cid: null, pubchem_url: null, title: null },
        }}
      />,
    );
    expect(screen.getByText(/not in pubchem/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("offers a PubChem structure-search link for an absent compound", () => {
    render(
      <PubChemPanel
        state={{
          state: "success",
          data: { ...base, status: "absent", cid: null, pubchem_url: null, title: null },
        }}
        smiles="c1ccccc1"
      />,
    );
    const link = screen.getByRole("link", { name: /find similar on pubchem/i });
    expect(link).toHaveAttribute("href", "https://pubchem.ncbi.nlm.nih.gov/#query=c1ccccc1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
