import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { MolecularFormula } from "./MolecularFormula";

describe("MolecularFormula", () => {
  it("subscripts element counts but preserves textContent", () => {
    const { container } = render(<MolecularFormula value="C6H12O6" />);
    // Visual: counts wrapped in <sub>; copyable text is unchanged.
    expect(container.querySelectorAll("sub")).toHaveLength(3);
    expect(container.textContent).toBe("C6H12O6");
  });

  it("renders a neutral formula with no superscript", () => {
    const { container } = render(<MolecularFormula value="C6H6" />);
    expect(container.querySelectorAll("sub")).toHaveLength(2);
    expect(container.querySelectorAll("sup")).toHaveLength(0);
    expect(container.textContent).toBe("C6H6");
  });

  it("superscripts a trailing charge and keeps brackets inline", () => {
    const { container } = render(<MolecularFormula value="[C6H5O]2-" />);
    expect(container.querySelector("sup")?.textContent).toBe("2-");
    expect(container.textContent).toBe("[C6H5O]2-");
  });

  it("handles a bare sign charge", () => {
    const { container } = render(<MolecularFormula value="Na+" />);
    expect(container.querySelector("sup")?.textContent).toBe("+");
    expect(container.textContent).toBe("Na+");
  });

  it("renders the fallback for empty/nullish input", () => {
    const { container } = render(<MolecularFormula value="" />);
    expect(container.textContent).toBe("—");
    const { container: c2 } = render(<MolecularFormula value={null} fallback="n/a" />);
    expect(c2.textContent).toBe("n/a");
  });
});
