import { formulaHasMetal } from "./elements";

describe("formulaHasMetal", () => {
  it("detects a transition metal in a real formula", () => {
    // The Cu complex from the sample file: Cl and Cu must not be confused.
    expect(formulaHasMetal("C69H57ClCuN2")).toBe(true);
  });

  it("returns false for a purely organic formula (Cl is not a metal)", () => {
    expect(formulaHasMetal("C6H5Cl")).toBe(false);
    expect(formulaHasMetal("C10H16N2O")).toBe(false);
  });

  it("handles empty / missing input", () => {
    expect(formulaHasMetal("")).toBe(false);
    expect(formulaHasMetal(null)).toBe(false);
    expect(formulaHasMetal(undefined)).toBe(false);
  });

  it("detects alkali and post-transition metals", () => {
    expect(formulaHasMetal("C2H3NaO2")).toBe(true); // sodium acetate
    expect(formulaHasMetal("C4H6O4Pb")).toBe(true); // lead acetate
  });

  it("detects the common metalloids (silyl, boron, arsenic, selenium)", () => {
    expect(formulaHasMetal("C6H16OSi")).toBe(true); // a TBS/TMS silyl ether
    expect(formulaHasMetal("C6H7BO2")).toBe(true); // phenylboronic acid
    expect(formulaHasMetal("C2H7AsO2")).toBe(true); // cacodylic acid
    expect(formulaHasMetal("C3H6O2Se")).toBe(true); // a selenium compound
  });
});
