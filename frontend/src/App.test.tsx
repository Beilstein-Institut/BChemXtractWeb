import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the heading", () => {
    render(<App />);
    expect(screen.getByText("BChemXtractWeb")).toBeInTheDocument();
  });

  it("renders the description", () => {
    render(<App />);
    expect(
      screen.getByText("Chemical structure extraction from ChemDraw files."),
    ).toBeInTheDocument();
  });
});
