/**
 * BrowseBento — compact extraction-receipt tests.
 *
 * One panel: identity + results (count + InChI usability) and, only when
 * reactions exist, a reactions stat. No export control (it lives in the
 * toolbar below). InChI status names the specific structures still missing a
 * key, driven by real per-structure InChI rather than `info.no_inchis`.
 */
import { render, screen } from "@testing-library/react";

import type { SubstanceInfoResponse } from "@/types/chemistry";

import { BrowseBento } from "./BrowseBento";

const INFO: SubstanceInfoResponse = { no_fragments: 48, no_inchis: 48, no_substances: 12 };

function renderBento(props: Partial<React.ComponentProps<typeof BrowseBento>> = {}) {
  return render(
    <BrowseBento
      filename="synthesis.cdxml"
      format="cdxml"
      fileSize={86_016}
      extractionTimeMs={420}
      info={INFO}
      structureCount={12}
      missingInchi={[]}
      warnings={[]}
      {...props}
    />,
  );
}

describe("BrowseBento", () => {
  it("renders the identity and results sections", () => {
    const { container } = renderBento();
    expect(container.querySelector('[data-slot="browse-bento"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="browse-bento-identity"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="browse-bento-results"]')).not.toBeNull();
  });

  it("headlines the filename, the unique count, and the dedup source", () => {
    renderBento();
    expect(screen.getByText("synthesis.cdxml")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/from 48 fragments/i)).toBeInTheDocument();
  });

  it("shows the provenance line (format · size · time)", () => {
    renderBento();
    expect(screen.getByText(/CDXML · 84 KB · 0\.4s/)).toBeInTheDocument();
  });

  it("omits the dedup source when no deduplication happened", () => {
    renderBento({ info: { no_fragments: 1, no_inchis: 1, no_substances: 1 }, structureCount: 1 });
    expect(screen.getByText(/^unique structure$/i)).toBeInTheDocument();
    expect(screen.queryByText(/from .* fragments/i)).not.toBeInTheDocument();
  });

  it("confirms quietly when every structure has a real InChI", () => {
    renderBento({ structureCount: 12, missingInchi: [] });
    expect(screen.getByText(/all 12 inchi keys resolved/i)).toBeInTheDocument();
  });

  it("names the specific structure missing an InChI (the vague-copy fix)", () => {
    renderBento({ structureCount: 4, missingInchi: ["C69H57ClCuN2"] });
    expect(screen.getByText(/3 of 4 structures have an inchi key/i)).toBeInTheDocument();
    // Formula is rendered (MolecularFormula splits digits into subscripts, so
    // match on an element that contains the atom symbols).
    expect(screen.getByText(/missing:/i)).toBeInTheDocument();
    expect(
      screen.getByText(/open it below to generate the inchi and inchikey/i),
    ).toBeInTheDocument();
    // No jargon, no contradictory "computed" count.
    expect(screen.queryByText(/fragment fallback/i)).not.toBeInTheDocument();
  });

  it("uses plural guidance when several structures are missing keys", () => {
    renderBento({ structureCount: 4, missingInchi: ["C10H8", "C6H6"] });
    expect(screen.getByText(/2 of 4 structures have an inchi key/i)).toBeInTheDocument();
    expect(
      screen.getByText(/open them below to generate the inchi and inchikey/i),
    ).toBeInTheDocument();
  });

  it("prompts to generate for any structure when none has an InChI", () => {
    renderBento({ structureCount: 4, missingInchi: ["", "", "", ""] });
    expect(screen.getByText(/inchi keys are not available for this file/i)).toBeInTheDocument();
    expect(
      screen.getByText(/open any structure below to generate the inchi and inchikey/i),
    ).toBeInTheDocument();
  });

  it("renders backend warnings verbatim (no client-side filtering)", () => {
    // The redundant fragment-fallback warning is dropped at the backend now,
    // so the component simply renders whatever warnings it is given.
    renderBento({ warnings: ["File extension does not match detected format."] });
    expect(screen.getByText(/extension does not match/i)).toBeInTheDocument();
  });

  it("shows the reaction count only when reactions exist", () => {
    const { container, rerender } = renderBento({ reactionCount: 3 });
    const reactions = container.querySelector('[data-slot="browse-bento-reactions"]');
    expect(reactions).not.toBeNull();
    expect(reactions?.textContent).toContain("3");
    expect(screen.getByText(/^reactions$/i)).toBeInTheDocument();

    // Zero / not-yet-extracted hides the section entirely (no confusing note).
    rerender(
      <BrowseBento filename="x.cdxml" structureCount={12} missingInchi={[]} reactionCount={0} />,
    );
    expect(container.querySelector('[data-slot="browse-bento-reactions"]')).toBeNull();
  });

  it("reports every still-missing structure in 'and N more', even without a formula", () => {
    // 3 structures missing a key; only one has a formula. The tail must count
    // all three, not just the named one.
    renderBento({ structureCount: 10, missingInchi: ["C6H6", "", ""] });
    expect(screen.getByText(/7 of 10 structures have an inchi key/i)).toBeInTheDocument();
    expect(screen.getByText(/and 2 more/i)).toBeInTheDocument();
  });

  it("shows the PubChem match count only when enrichment is active", () => {
    const { rerender } = renderBento({
      pubchem: { active: false, matched: 2, total: 4, settled: 4, errored: 0 },
    });
    expect(screen.queryByText(/pubchem/i)).not.toBeInTheDocument();

    rerender(
      <BrowseBento
        filename="synthesis.cdxml"
        structureCount={4}
        missingInchi={[]}
        pubchem={{ active: true, matched: 3, total: 4, settled: 4, errored: 0 }}
      />,
    );
    expect(screen.getByText(/3 of 4/)).toBeInTheDocument();
    expect(screen.getByText(/matched in pubchem/i)).toBeInTheDocument();
  });

  it("shows a checking state while PubChem lookups are still resolving", () => {
    renderBento({ pubchem: { active: true, matched: 1, total: 4, settled: 2, errored: 0 } });
    expect(screen.getByText(/checking pubchem/i)).toBeInTheDocument();
    expect(screen.queryByText(/matched in pubchem/i)).not.toBeInTheDocument();
  });

  it("reports a PubChem outage as an error, not '0 matched'", () => {
    // All lookups errored (network failure) — must NOT read as a definitive
    // "0 of N matched" chemical result.
    renderBento({ pubchem: { active: true, matched: 0, total: 4, settled: 4, errored: 4 } });
    expect(screen.getByText(/could not reach pubchem/i)).toBeInTheDocument();
    expect(screen.queryByText(/matched in pubchem/i)).not.toBeInTheDocument();
  });

  it("flags partially-checked results when some lookups errored", () => {
    renderBento({ pubchem: { active: true, matched: 2, total: 4, settled: 4, errored: 1 } });
    expect(screen.getByText(/2 of 4/)).toBeInTheDocument();
    expect(screen.getByText(/1 not checked/i)).toBeInTheDocument();
  });

  it("shows the molecular weight range on the PubChem line when available", () => {
    renderBento({
      pubchem: {
        active: true,
        matched: 2,
        total: 4,
        settled: 4,
        errored: 0,
        mwMin: 320.4,
        mwMax: 1089.6,
      },
    });
    expect(screen.getByText(/mw 320 to 1090/i)).toBeInTheDocument();
  });

  it("collapses a MW range to a single value when both ends round equal", () => {
    renderBento({
      pubchem: {
        active: true,
        matched: 2,
        total: 4,
        settled: 4,
        errored: 0,
        mwMin: 320.2,
        mwMax: 320.4,
      },
    });
    expect(screen.getByText(/mw 320\b/i)).toBeInTheDocument();
    expect(screen.queryByText(/320 to 320/)).not.toBeInTheDocument();
  });

  it("flags an active filter, including when it empties the grid", () => {
    const { rerender } = renderBento({ structureCount: 12, filtersActive: true, filteredCount: 3 });
    expect(screen.getByText(/3 of 12 match your filter/i)).toBeInTheDocument();

    rerender(
      <BrowseBento
        filename="synthesis.cdxml"
        structureCount={12}
        missingInchi={[]}
        filtersActive
        filteredCount={0}
      />,
    );
    expect(screen.getByText(/no structures match your filter/i)).toBeInTheDocument();
  });

  it("shows abbreviation and metal facts on one compact line", () => {
    renderBento({ abbreviationCount: 12, metalCount: 1 });
    expect(
      screen.getByText(/12 abbreviations expanded · 1 with a metal or metalloid/i),
    ).toBeInTheDocument();
  });

  it("omits the facts line entirely when there is nothing to report", () => {
    renderBento({ abbreviationCount: 0, metalCount: 0 });
    expect(screen.queryByText(/abbreviation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/with a metal/i)).not.toBeInTheDocument();
  });

  it("has no export control (that lives in the toolbar below)", () => {
    renderBento();
    expect(screen.queryByRole("button", { name: /export/i })).toBeNull();
  });
});
