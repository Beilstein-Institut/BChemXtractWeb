/**
 * ChemistryThemeSwitch — tests for the claymorphism sky slider with
 * the conical (Erlenmeyer) flask puck (Phase 3 Task 21).
 *
 * The component is a plain `<label>` wrapping a hidden checkbox whose
 * state drives the ThemeProvider. Assertions cover the data-slot
 * contract, aria-label polarity, the new DOM shape
 * (theme-switch__container / theme-switch__clouds /
 * theme-switch__stars-container / theme-switch__flask), and
 * Light↔Dark persistence through localStorage.bchemxtract-theme.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "./theme-provider";
import { ChemistryThemeSwitch } from "./ChemistryThemeSwitch";

function renderWithProvider(defaultTheme: "light" | "dark" | "system" = "light") {
  return render(
    <ThemeProvider defaultTheme={defaultTheme} storageKey="bchemxtract-theme">
      <ChemistryThemeSwitch />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
});

describe("ChemistryThemeSwitch", () => {
  it("exposes data-slot=\"theme-switch\" on the root label", () => {
    renderWithProvider();
    const root = document.querySelector('[data-slot="theme-switch"]');
    expect(root).not.toBeNull();
    expect(root?.tagName.toLowerCase()).toBe("label");
  });

  it("renders a hidden checkbox with role=switch", () => {
    renderWithProvider();
    const checkbox = screen.getByRole("switch");
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.getAttribute("type")).toBe("checkbox");
  });

  it("announces 'Switch to dark theme' when in light mode", () => {
    renderWithProvider("light");
    expect(screen.getByLabelText("Switch to dark theme")).toBeInTheDocument();
  });

  it("announces 'Switch to light theme' when in dark mode", () => {
    renderWithProvider("dark");
    expect(screen.getByLabelText("Switch to light theme")).toBeInTheDocument();
  });

  it("applies the theme-switch class cluster for the scoped CSS", () => {
    renderWithProvider();
    const root = document.querySelector('[data-slot="theme-switch"]');
    expect(root?.className).toContain("theme-switch");
    expect(document.querySelector(".theme-switch__container")).not.toBeNull();
    expect(document.querySelector(".theme-switch__clouds")).not.toBeNull();
    expect(document.querySelector(".theme-switch__stars-container")).not.toBeNull();
    expect(document.querySelector(".theme-switch__circle-container")).not.toBeNull();
    expect(document.querySelector(".theme-switch__flask")).not.toBeNull();
  });

  it("renders the Erlenmeyer flask body + liquid inside the puck", () => {
    renderWithProvider();
    expect(document.querySelector(".theme-switch__flask-body")).not.toBeNull();
    expect(document.querySelector(".theme-switch__flask-liquid")).not.toBeNull();
    // Bubbles inside the liquid — cosmetic detail that should exist.
    expect(
      document.querySelectorAll(".theme-switch__flask-bubble").length,
    ).toBeGreaterThan(0);
  });

  it("defines light + dark liquid gradients in the SVG <defs>", () => {
    renderWithProvider();
    expect(
      document.querySelector("#chem-flask-liquid-light"),
    ).not.toBeNull();
    expect(document.querySelector("#chem-flask-liquid-dark")).not.toBeNull();
  });

  it("toggling the checkbox from light persists 'dark' to localStorage", () => {
    renderWithProvider("light");
    const checkbox = screen.getByRole("switch") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(localStorage.getItem("bchemxtract-theme")).toBe("dark");
  });

  it("toggling the checkbox from dark persists 'light' to localStorage", () => {
    renderWithProvider("dark");
    const checkbox = screen.getByRole("switch") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(localStorage.getItem("bchemxtract-theme")).toBe("light");
  });

  it("flipping to dark adds the .dark class on <html>", () => {
    renderWithProvider("light");
    const checkbox = screen.getByRole("switch") as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("aria-label flips polarity after the user toggles to dark", () => {
    renderWithProvider("light");
    const checkbox = screen.getByRole("switch") as HTMLInputElement;
    expect(screen.getByLabelText("Switch to dark theme")).toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(screen.getByLabelText("Switch to light theme")).toBeInTheDocument();
  });
});
