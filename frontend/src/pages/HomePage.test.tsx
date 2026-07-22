/**
 * HomePage — landing route tests.
 *
 * The home is a landing, not the tool: it must orient (tagline + the
 * drawn-to-identifiers demo) and offer a prominent way into /extract,
 * without embedding the upload surface itself.
 */
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { HomePage } from "./HomePage";
import { navigate } from "@/lib/router";

vi.mock("@/lib/router", () => ({ navigate: vi.fn() }));

describe("HomePage", () => {
  it("renders the hero tagline and the demonstration", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/ChemDraw, read back\./i);
    // The demo shows a real, resolved structure — proof over prose.
    expect(screen.getByRole("img", { name: /aspirin/i })).toBeInTheDocument();
    expect(screen.getByText("CC(=O)Oc1ccccc1C(=O)O")).toBeInTheDocument();
  });

  it("routes into /extract from the primary CTA", () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: /start extracting/i }));
    expect(vi.mocked(navigate)).toHaveBeenCalledWith("/extract");
  });

  it("offers a secondary way into the library", () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: /browse the library/i }));
    expect(vi.mocked(navigate)).toHaveBeenCalledWith("/browse");
  });
});
